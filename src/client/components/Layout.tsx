import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Footer } from './Footer.js';
import styles from './Layout.module.css';

export function Layout() {
  return (
    <div className={styles.shell}>
      <div className="grain-overlay" aria-hidden="true" />
      <Sidebar />
      <div className={styles.content}>
        <div className={styles.contentBody}>
          <Outlet />
        </div>
        <Footer />
      </div>
    </div>
  );
}
