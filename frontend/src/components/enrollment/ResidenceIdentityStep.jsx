import {
  ArrowRight, Building2, CheckCircle2, CalendarDays, CreditCard, FileSignature, Layers, Mail, Phone, Plus,
  Trash2, Upload, User,
} from 'lucide-react';
import EnrollmentProgress from './EnrollmentProgress';
import FormField from './FormField';
import { requiresNationalId } from '../../utils/household';
import SelectField from './SelectField';
import { buildingsInProject, draftResidences, unitLocked, unitsInBuilding } from '../../utils/enrollment';

export default function ResidenceIdentityStep({
  draft, errors, projects, projectsLoading, projectsError, onRetryProjects,
  onChange, onResidenceChange, onAddResidence, onRemoveResidence, onDocumentChange, onContinue,
  onAddLeasePages, onRemoveLeasePage, onChangeResidentType,
}) {
  const leasePages = draft.leasePages ?? [];
  const tenant = draft.residentType === 'tenant';
  const showNationalId = requiresNationalId(draft.age);
  const residences = draftResidences(draft);
  const residenceErrors = errors.residences ?? {};
  const projectOptions = projects.map((project) => ({ value: project.project, label: project.project }));

  return (
    <section className="enrollment-card" aria-labelledby="residence-title">
      <EnrollmentProgress currentStep={1} totalSteps={5} />
      <p className="enrollment-step-label">Step 1 of 5 · Residence & identity</p>
      <h1 id="residence-title">Register your residence</h1>
      <p className="enrollment-subtitle">Your entered details are saved automatically on this device.</p>
      <p className="resident-type-badge">
        Registering as {tenant ? 'a tenant' : 'the owner'}
        <button type="button" onClick={onChangeResidentType}>Change</button>
      </p>
      <form onSubmit={(event) => { event.preventDefault(); onContinue(); }} noValidate>
        <h2 className="enrollment-section-title"><Building2 size={18} aria-hidden="true" /> Residence</h2>

        {/* A resident may own units in several buildings, or in more than one
            project, so the residence block repeats rather than being a single
            building/unit pair. */}
        {residences.map((residence, index) => {
          const buildingOptions = buildingsInProject(residence.project, projects)
            .map((building) => ({
              value: building.code,
              label: building.name?.[0] && building.name[0] !== building.code
                ? `${building.name[0]} · ${building.code}` : building.code,
            }));
          // A unit an owner has already registered is shown but cannot be
          // picked, so the resident sees why it is unavailable. A tenant may
          // still choose it: they rent it from that owner.
          const unitOptions = unitsInBuilding(residence.project, residence.building, projects)
            .map((unit) => {
              const locked = unitLocked(unit, draft.residentType);
              return {
                value: unit.code,
                label: locked ? `${unit.code} — already registered by its owner` : unit.code,
                disabled: locked,
              };
            });
          return (
            <fieldset className="enrollment-residence" key={residence.id}>
              <legend>
                {index === 0 ? 'Primary unit' : `Additional unit ${index}`}
                {residences.length > 1 ? (
                  <button type="button" className="enrollment-residence-remove"
                    onClick={() => onRemoveResidence(residence.id)}
                    aria-label={`Remove unit ${index + 1}`}>
                    <Trash2 size={14} aria-hidden="true" /> Remove
                  </button>
                ) : null}
              </legend>
              <div className="enrollment-grid">
                <SelectField id={`project-${residence.id}`} label="Project" icon={Layers}
                  value={residence.project} options={projectOptions}
                  placeholder={projectsLoading ? 'Loading projects…' : 'Select project'} required
                  disabled={projectsLoading || Boolean(projectsError)}
                  onChange={(event) => onResidenceChange(residence.id, { project: event.target.value })} />
                <SelectField id={`building-${residence.id}`} label="Building" icon={Building2}
                  value={residence.building} options={buildingOptions} placeholder="Select building" required
                  disabled={!residence.project || projectsLoading}
                  onChange={(event) => onResidenceChange(residence.id, { building: event.target.value })} />
              </div>
              <SelectField id={`unit-${residence.id}`} label="Unit" icon={Building2}
                value={residence.unit} options={unitOptions} placeholder="Select unit" required
                disabled={!residence.building || projectsLoading}
                error={residenceErrors[index]}
                onChange={(event) => onResidenceChange(residence.id, { unit: event.target.value })} />
            </fieldset>
          );
        })}

        <button type="button" className="enrollment-add-residence" onClick={onAddResidence}
          disabled={projectsLoading || Boolean(projectsError)}>
          <Plus size={16} aria-hidden="true" /> Add another unit
        </button>

        {/* No projects means no building has had its unit list entered yet.
            Say so plainly rather than showing a form that cannot be filled. */}
        {!projectsLoading && !projectsError && !projects.length ? (
          <div className="enrollment-options-error" role="alert">
            <span>
              Registration is not open yet: the list of units has not been set up for any
              building. Please contact the community office.
            </span>
            <button type="button" onClick={onRetryProjects}>Try again</button>
          </div>
        ) : null}

        {projectsError ? (
          <div className="enrollment-options-error" role="alert">
            <span>{projectsError}</span><button type="button" onClick={onRetryProjects}>Try again</button>
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
        {/* Tenants prove the right to live in the unit with their lease. */}
        {tenant && <div className={`enrollment-document ${errors.leaseDoc ? 'has-error' : ''}`}>
          <span className="enrollment-document-label">Rental agreement * {leasePages.length ? `(${leasePages.length} ${leasePages.length === 1 ? 'page' : 'pages'})` : ''}</span>
          {leasePages.length > 0 && <div className="lease-pages">
            {leasePages.map((page, index) => (
              <figure key={page.id} className="lease-page">
                <img src={page.image} alt={`Rental agreement page ${index + 1}`} />
                <figcaption>Page {index + 1}</figcaption>
                <button type="button" aria-label={`Remove page ${index + 1}`} onClick={() => onRemoveLeasePage(page.id)}><Trash2 size={14} /></button>
              </figure>
            ))}
          </div>}
          {leasePages.length < 8 && <label htmlFor="lease-document">
            {leasePages.length ? <Plus size={22} aria-hidden="true" /> : <FileSignature size={22} aria-hidden="true" />}
            <span>
              <strong>{leasePages.length ? 'Add another page' : 'Upload rental agreement'}</strong>
              <small>{leasePages.length ? 'Optional: add more pages if your agreement has them.' : 'One photo per page; one page is fine · JPG, PNG or WebP'}</small>
            </span>
            <input id="lease-document" name="leaseDocument" type="file" accept="image/jpeg,image/png,image/webp" multiple
              onChange={(event) => { onAddLeasePages([...(event.target.files ?? [])]); event.target.value = ''; }} />
          </label>}
          {errors.leaseDoc ? <p className="enrollment-field-error">{errors.leaseDoc}</p> : null}
        </div>}
        <button className="enrollment-button" type="submit"
          disabled={projectsLoading || Boolean(projectsError) || !projects.length}>
          Continue to face capture <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
