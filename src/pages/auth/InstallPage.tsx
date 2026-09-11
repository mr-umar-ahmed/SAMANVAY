import { Link } from 'react-router-dom';
import { Download, Share, PlusSquare, ArrowLeft } from 'lucide-react';
import { useLang } from '../../i18n';
import { useInstallPrompt } from '../../features/pwa/useInstallPrompt';
import { Callout } from '../../components/ui';

/** Manual install instructions (iOS Safari has no install prompt API). */
export default function InstallPage() {
  const lang = useLang();
  const hi = lang === 'hi';
  const { canInstall, install, installed, ios } = useInstallPrompt();
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }} className="stack-lg">
      <Link to="/" className="row small"><ArrowLeft size={14} /> {hi ? 'वापस' : 'Back'}</Link>
      <h1>{hi ? 'समन्वय ऐप इंस्टॉल करें' : 'Install the SAMANVAY app'}</h1>
      <p className="muted">{hi ? 'इंस्टॉल करने पर ऐप होम स्क्रीन से खुलता है, पूरी स्क्रीन में चलता है और पिछली योजना ऑफ़लाइन भी दिखा सकता है।' : 'Installed, the app opens from your home screen, runs full-screen and can show the last plan while offline.'}</p>
      {installed && <Callout tone="ok">{hi ? 'ऐप पहले से इंस्टॉल है।' : 'The app is already installed.'}</Callout>}
      {canInstall && (
        <button className="btn btn-primary btn-lg" onClick={() => void install()}>
          <Download /> {hi ? 'अभी इंस्टॉल करें' : 'Install now'}
        </button>
      )}
      {ios && (
        <div className="card">
          <div className="card-body stack">
            <div className="strong">{hi ? 'iPhone / iPad (Safari)' : 'iPhone / iPad (Safari)'}</div>
            <div className="row small"><Share size={16} /> {hi ? '1. नीचे “Share” बटन दबाएँ' : '1. Tap the Share button in the toolbar'}</div>
            <div className="row small"><PlusSquare size={16} /> {hi ? '2. “Add to Home Screen” चुनें' : '2. Choose “Add to Home Screen”'}</div>
            <div className="row small">3. {hi ? '“Add” दबाएँ' : 'Tap “Add”'}</div>
          </div>
        </div>
      )}
      {!ios && !canInstall && !installed && (
        <Callout tone="neutral">
          {hi ? 'Chrome / Edge में पता-बार के दाईं ओर “Install” आइकन दबाएँ, या ब्राउज़र मेनू से “Install app / Add to Home screen” चुनें।' : 'In Chrome or Edge, use the install icon at the right of the address bar, or choose “Install app / Add to Home screen” from the browser menu.'}
        </Callout>
      )}
    </div>
  );
}
