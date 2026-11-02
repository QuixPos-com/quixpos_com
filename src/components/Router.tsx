import { Component, toChildArray } from 'preact'
import type { ComponentChildren, VNode } from 'preact'

export interface RouteParams {
  [key: string]: string
}

export interface RouterProps {
  url?: string
  children: ComponentChildren
  onChange?: (path: string) => void
}

export interface RouterState {
  currentPath: string
}

let activeRouterInstance: Router | null = null

export function navigate(to: string, replace = false) {
  if (typeof window === 'undefined') return

  if (replace) {
    window.history.replaceState({}, '', to)
  } else {
    window.history.pushState({}, '', to)
  }

  if (activeRouterInstance) {
    activeRouterInstance.handlePathChange(to)
  }
}

export function matchPath(pattern: string, path: string): { matches: boolean; params: RouteParams } {
  // Normalize paths (strip trailing slashes except root)
  const normPattern = pattern === '/' ? '/' : pattern.replace(/\/+$/, '')
  const normPath = path === '/' ? '/' : path.replace(/\/+$/, '')

  if (normPattern === '*' || normPattern === normPath) {
    return { matches: true, params: {} }
  }

  const patternParts = normPattern.split('/')
  const pathParts = normPath.split('/')

  if (patternParts.length !== pathParts.length) {
    return { matches: false, params: {} }
  }

  const params: RouteParams = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pPart = patternParts[i]
    const uPart = pathParts[i]

    if (pPart.startsWith(':')) {
      params[pPart.slice(1)] = decodeURIComponent(uPart)
    } else if (pPart !== uPart) {
      return { matches: false, params: {} }
    }
  }

  return { matches: true, params }
}

export class Router extends Component<RouterProps, RouterState> {
  constructor(props: RouterProps) {
    super(props)
    const initialPath = props.url || (typeof window !== 'undefined' ? window.location.pathname : '/')
    this.state = {
      currentPath: initialPath,
    }
  }

  componentDidMount() {
    activeRouterInstance = this

    // Handle legacy hash route redirect: #docs/some-page -> /docs/some-page
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash.startsWith('#docs/') || hash.startsWith('#dokumentation/')) {
        const sub = hash.replace(/^#(docs|dokumentation)\/?/, '')
        const target = sub ? `/docs/${sub}` : '/docs'
        window.history.replaceState({}, '', target)
        this.handlePathChange(target)
      } else if (hash === '#docs' || hash === '#dokumentation') {
        window.history.replaceState({}, '', '/docs')
        this.handlePathChange('/docs')
      }

      window.addEventListener('popstate', this.onPopState)
      document.addEventListener('click', this.onGlobalClick)
    }
  }

  componentWillUnmount() {
    if (activeRouterInstance === this) {
      activeRouterInstance = null
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.onPopState)
      document.removeEventListener('click', this.onGlobalClick)
    }
  }

  onPopState = () => {
    this.handlePathChange(window.location.pathname)
  }

  onGlobalClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) {
      return
    }

    const target = (e.target as HTMLElement).closest('a')
    if (!target) return

    const href = target.getAttribute('href')
    if (!href) return

    // External or anchor-only link
    if (
      href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('//') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      target.getAttribute('target') === '_blank'
    ) {
      return
    }

    // Same-page hash navigation like #id
    if (href.startsWith('#')) {
      return
    }

    e.preventDefault()
    navigate(href)
    window.scrollTo(0, 0)
  }

  handlePathChange(path: string) {
    const cleanPath = path.split('?')[0].split('#')[0] || '/'
    this.setState({ currentPath: cleanPath }, () => {
      if (this.props.onChange) {
        this.props.onChange(cleanPath)
      }
    })
  }

  render() {
    const { children } = this.props
    const { currentPath } = this.state

    const childList = toChildArray(children) as VNode<RouteProps>[]

    for (const child of childList) {
      if (!child || !child.props) continue
      const { path } = child.props
      if (!path) continue

      const match = matchPath(path, currentPath)
      if (match.matches) {
        // Clone element with matches params and currentPath
        return <RouteWrapper child={child} params={match.params} currentPath={currentPath} />
      }
    }

    return null
  }
}

interface RouteWrapperProps {
  child: VNode<RouteProps>
  params: RouteParams
  currentPath: string
}

class RouteWrapper extends Component<RouteWrapperProps> {
  render() {
    const { child, params, currentPath } = this.props
    const Comp = child.props.component
    if (Comp) {
      return <Comp params={params} currentPath={currentPath} />
    }
    return child.props.children as VNode<unknown> | null
  }
}

export interface RouteProps {
  path: string
  component?: any
  children?: ComponentChildren
}

export class Route extends Component<RouteProps> {
  render() {
    return this.props.children || null
  }
}

export interface LinkProps {
  href: string
  class?: string
  className?: string
  style?: any
  activeClassName?: string
  children?: ComponentChildren
  title?: string
  'aria-label'?: string
  target?: string
  rel?: string
  onClick?: (e: MouseEvent) => void
}

export class Link extends Component<LinkProps> {
  handleClick = (e: MouseEvent) => {
    if (this.props.onClick) {
      this.props.onClick(e)
    }
    const { href, target } = this.props
    if (target === '_blank' || href.startsWith('http') || href.startsWith('//')) {
      return
    }
    if (href.startsWith('#')) {
      return
    }
    e.preventDefault()
    navigate(href)
    window.scrollTo(0, 0)
  }

  render() {
    const { href, class: cls, className, style, children, title, 'aria-label': ariaLabel, target, rel } = this.props
    return (
      <a
        href={href}
        class={cls || className}
        className={className || cls}
        style={style}
        title={title}
        aria-label={ariaLabel}
        target={target}
        rel={rel}
        onClick={this.handleClick}
      >
        {children}
      </a>
    )
  }
}
