/**
 * 邮件正文清洗。
 *
 * 服务端已经做过一轮过滤（dto/parsemail/email_xss_test.go），但正文来自外部邮件，
 * 前端再兜一层：去掉脚本类标签、事件属性、javascript: 协议，
 * 并把 cid: 内联图片改写成后端的附件地址。
 */
const BLOCKED_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base']

export function sanitizeMailHtml(html: string, emailId?: number): string {
  if (!html) return ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="pmail-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('pmail-root')
  if (!root) return ''

  BLOCKED_TAGS.forEach((tag) => {
    root.querySelectorAll(tag).forEach((node) => node.remove())
  })

  root.querySelectorAll('*').forEach((element) => {
    // 事件属性与 style 里的 expression / behavior
    Array.from(element.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttribute(attr.name)
        return
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
        element.removeAttribute(attr.name)
      }
    })

    if (element.tagName === 'A') {
      element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noopener noreferrer')
    }

    if (element.tagName === 'IMG' && emailId) {
      const src = element.getAttribute('src') ?? ''
      if (src.startsWith('cid:')) {
        const cid = src.slice(4).replace(/^<|>$/g, '')
        element.setAttribute('src', `/attachments/${emailId}/${encodeURIComponent(cid)}`)
      }
    }
  })

  return root.innerHTML
}

/** 正文里是否存在远程图片（用于提示「远程内容已加载」） */
export function hasRemoteImages(html: string): boolean {
  return /<img[^>]+src=["']?(https?:)?\/\//i.test(html)
}
