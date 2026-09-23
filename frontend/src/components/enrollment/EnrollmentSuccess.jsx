import { Check, Clock3 } from 'lucide-react';

export default function EnrollmentSuccess({ reference }) {
  return (
    <section className="enrollment-card enrollment-success" aria-labelledby="success-title">
      <div className="success-icon"><Check size={42} /></div>
      <h1 id="success-title">Application submitted</h1>
      <p>Your registration was received successfully and is waiting for administrator validation.</p>
      <div className="success-reference"><small>Application reference</small><strong>{reference}</strong></div>
      <div className="capture-security-note"><Clock3 size={18} /> Status: Pending validation. Your face has not been activated in the Face Database yet.</div>
    </section>
  );
}
