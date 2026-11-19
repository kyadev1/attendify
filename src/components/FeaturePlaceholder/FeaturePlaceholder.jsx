import './FeaturePlaceholder.css'

export default function FeaturePlaceholder({ title, description }) {
  return <section className="feature-placeholder"><h1 className="feature-placeholder__title">{title}</h1><p className="feature-placeholder__description">{description}</p><p className="feature-placeholder__notice">This feature is not implemented yet.</p></section>
}
