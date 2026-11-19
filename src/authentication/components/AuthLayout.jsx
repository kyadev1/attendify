import attendifyLogo from '../../assets/ttendify-logo-optimized.png'
import { Link } from 'react-router-dom'
import styles from '../styles/AuthLayout.module.css'

export default function AuthLayout({ title, subtitle, children }) {
  return <main className={styles.layout}><section className={styles.card} aria-labelledby="auth-title"><Link className={styles.brand} to="/login"><img className={styles.logo} src={attendifyLogo} alt="Attendify" width="256" height="256" /></Link><h1 id="auth-title">{title}</h1><p className={styles.subtitle}>{subtitle}</p>{children}</section></main>
}
