import { Component } from 'react'
import Button from '../components/Button/Button'

// A failed route download must leave an accessible recovery action instead of
// an empty screen. Reload also recovers cached chunk URLs after deployments.
export default class PageBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <section role="alert" className="route-loading">
      <p>Unable to load this page. Check your connection and reload to try again.</p>
      <Button onClick={() => window.location.reload()}>Reload page</Button>
    </section>
    return this.props.children
  }
}
