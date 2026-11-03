import { Component } from 'preact'
import { Router, Route } from './Router'
import IndexRoute from '../routes/index'
import DocsRoute from '../routes/docs'
import AccountRoute from '../routes/account'
import OAuthAuthorizeRoute from '../routes/oauth-authorize'
import PrivacyPolicyRoute from '../routes/privacypolicy'
import TermsRoute from '../routes/terms'
import '../fonts.css'
import '../style.css'
import '../docs/docs.css'

export interface AppProps {
  url?: string
}

export class App extends Component<AppProps> {
  render() {
    const { url } = this.props

    return (
      <div class="app-root">
        <Router url={url}>
          <Route path="/" component={IndexRoute} />
          <Route path="/docs" component={DocsRoute} />
          <Route path="/docs/:pageId" component={DocsRoute} />
          <Route path="/account" component={AccountRoute} />
          <Route path="/oauth/authorize" component={OAuthAuthorizeRoute} />
          <Route path="/privacypolicy" component={PrivacyPolicyRoute} />
          <Route path="/terms" component={TermsRoute} />
          <Route path="*" component={IndexRoute} />
        </Router>
      </div>
    )
  }
}
