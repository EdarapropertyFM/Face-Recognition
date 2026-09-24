import { ArrowRight, Building2, CheckCircle2, CalendarDays, CreditCard, Mail, Phone, Upload, User } from 'lucide-react';
import EnrollmentProgress from './EnrollmentProgress';
import FormField from './FormField';
import { requiresNationalId } from '../../utils/household';
import SelectField from './SelectField';
import { getUnitsForBuilding } from '../../utils/enrollment';

export default function ResidenceIdentityStep({
  draft, errors, buildings, buildingsLoading, buildingsError, onRetryBuildings,
  onChange, onBuildingChange, onDocumentChange, onContinue,
}) {
  const showNationalId = requiresNationalId(draft.age);
  const buildingOptions = buildings.map((building) => ({
    value: building.code,
    label: `${building.name?.[0] || building.code} · ${building.code}`,
  }));
  const unitOptions = getUnitsForBuilding(draft.building, buildings);
  return (
    <section className="enrollment-card" aria-labelledby="residence-title">
      <EnrollmentProgress currentStep={1} totalSteps={5} />
      <p className="enrollment-step-label">Step 1 of 5 · Residence & identity</p>
      <h1 id="residence-title">Register your residence</h1>
      <p className="enrollment-subtitle">Your entered details are saved automatically on this device.</p>
      <form onSubmit={(event) => { event.preventDefault(); onContinue(); }} noValidate>
        <h2 className="enrollment-section-title"><Building2 size={18} aria-hidden="true" /> Residence</h2>
        <div className="enrollment-grid">
          <SelectField id="building" label="Building" icon={Building2} value={draft.building}
            error={errors.building} options={buildingOptions}
            placeholder={buildingsLoading ? 'Loading buildings…' : 'Select building'} required disabled={buildingsLoading || Boolean(buildingsError)}
            onChange={(event) => onBuildingChange(event.target.value)} />
          <SelectField id="unit" label="Unit" icon={Building2} value={draft.unit}
            error={errors.unit} options={unitOptions} placeholder="Select unit" required
            disabled={!draft.building || buildingsLoading} onChange={(event) => onChange('unit', event.target.value)} />
        </div>
        {buildingsError ? (
          <div className="enrollment-options-error" role="alert">
            <span>{buildingsError}</span><button type="button" onClick={onRetryBuildings}>Try again</button>
          </div>
        ) : null}
        <h2 className="enrollment-section-title"><User size={18} aria-hidden="true" /> Personal details</h2>
        <FormField id="name" label="Full name" icon={User} value={draft.name} error={errors.name}
          autoComplete="name" required onChange={(event) => onChange('name', event.target.value)} />
        <div className="enrollment-grid">
          <FormField id="age" label="Age" icon={CalendarDays} value={draft.age} error={errors.age}
            inputMode="numeric" autoComplete="off" maxLength={3} required
            onChange={(event) => onChange('age', event.target.value.replace(/\D/g, '').slice(0, 3))} />
          <FormField id="mobile" label="Mobile number" icon={Phone} value={draft.mobile} error={errors.mobile}
            inputMode="tel" autoComplete="tel" maxLength={11} required
            onChange={(event) => onChange('mobile', event.target.value.replace(/\D/g, '').slice(0, 11))} />
        </div>
        {/* A National ID exists only from 16, so it is asked for only then
            rather than shown and left blank. */}
        {showNationalId && <FormField id="nid" label="National ID" icon={CreditCard} value={draft.nid} error={errors.nid}
          inputMode="numeric" autoComplete="off" maxLength={14} required
          onChange={(event) => onChange('nid', event.target.value.replace(/\D/g, '').slice(0, 14))} />}
        <FormField id="email" label="Email (optional)" icon={Mail} type="email" value={draft.email}
          error={errors.email} autoComplete="email" onChange={(event) => onChange('email', event.target.value)} />
        {showNationalId && <div className={`enrollment-document ${errors.idDoc ? 'has-error' : ''}`}>
          <span className="enrollment-document-label">National ID card *</span>
          <label htmlFor="id-document">
            {draft.idDocName || draft.idDocImage ? <CheckCircle2 size={22} aria-hidden="true" /> : <Upload size={22} aria-hidden="true" />}
            <span>
              <strong>{draft.idDocName || (draft.idDocImage ? 'National ID card attached' : 'Upload National ID card')}</strong>
              <small>{draft.idDocName || draft.idDocImage ? 'Attached to this registration.' : 'JPG, PNG or WebP · maximum 5 MB'}</small>
            </span>
            <input id="id-document" name="idDocument" type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(event) => onDocumentChange(event.target.files?.[0] ?? null)} />
          </label>
          {errors.idDoc ? <p className="enrollment-field-error">{errors.idDoc}</p> : null}
        </div>}
        <button className="enrollment-button" type="submit" disabled={buildingsLoading || Boolean(buildingsError) || !buildings.length}>
          Continue to face capture <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
