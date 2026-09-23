import { ArrowLeft, ArrowRight, Plus, Trash2, UserRoundPlus, Users } from 'lucide-react';
import { useState } from 'react';
import EnrollmentProgress from './EnrollmentProgress';
import FormField from './FormField';
import SelectField from './SelectField';

const RELATIONS = ['Spouse', 'Son', 'Daughter', 'Parent', 'Sibling', 'Other'];

function validateMembers(members) {
  return members.map((member) => {
    const errors = {};
    if (member.name.trim().length < 3) errors.name = 'Enter the member’s full name.';
    if (!RELATIONS.includes(member.relation)) errors.relation = 'Choose a relationship.';
    if (member.nid && !/^\d{14}$/.test(member.nid)) errors.nid = 'National ID must contain 14 digits.';
    return errors;
  });
}

export default function HouseholdStep({ members, onChange, onBack, onContinue }) {
  const [errors, setErrors] = useState([]);

  const addMember = () => onChange([...members, { id: crypto.randomUUID(), name: '', relation: '', nid: '' }]);
  const updateMember = (index, field, value) => {
    onChange(members.map((member, memberIndex) => memberIndex === index ? { ...member, [field]: value } : member));
    setErrors((current) => current.map((entry, errorIndex) => errorIndex === index ? { ...entry, [field]: undefined } : entry));
  };
  const removeMember = (index) => {
    onChange(members.filter((_, memberIndex) => memberIndex !== index));
    setErrors((current) => current.filter((_, errorIndex) => errorIndex !== index));
  };
  const next = () => {
    const nextErrors = validateMembers(members);
    setErrors(nextErrors);
    if (nextErrors.every((entry) => Object.keys(entry).length === 0)) onContinue();
  };

  return (
    <section className="enrollment-card" aria-labelledby="household-title">
      <EnrollmentProgress currentStep={3} totalSteps={5} />
      <p className="enrollment-step-label">Step 3 of 5 · Household</p>
      <h1 id="household-title">Household members</h1>
      <p className="enrollment-subtitle">Add people living in your unit, or continue if you live alone.</p>

      {members.length ? members.map((member, index) => (
        <article className="enrollment-entry" key={member.id}>
          <div className="enrollment-entry-header">
            <span><Users size={17} /> Member {index + 1}</span>
            <button type="button" onClick={() => removeMember(index)} aria-label={`Remove member ${index + 1}`}>
              <Trash2 size={17} />
            </button>
          </div>
          <FormField id={`member-name-${member.id}`} label="Full name" value={member.name}
            error={errors[index]?.name} required onChange={(event) => updateMember(index, 'name', event.target.value)} />
          <div className="enrollment-grid">
            <SelectField id={`member-relation-${member.id}`} label="Relationship" value={member.relation}
              error={errors[index]?.relation} options={RELATIONS} placeholder="Select relationship" required
              onChange={(event) => updateMember(index, 'relation', event.target.value)} />
            <FormField id={`member-nid-${member.id}`} label="National ID (optional)" value={member.nid}
              error={errors[index]?.nid} inputMode="numeric" maxLength={14}
              onChange={(event) => updateMember(index, 'nid', event.target.value.replace(/\D/g, '').slice(0, 14))} />
          </div>
        </article>
      )) : (
        <div className="enrollment-empty"><UserRoundPlus size={28} /><strong>No household members added</strong><span>You can safely continue if none apply.</span></div>
      )}

      <button className="enrollment-add-button" type="button" onClick={addMember}><Plus size={18} /> Add household member</button>
      <div className="enrollment-actions">
        <button className="enrollment-button secondary" type="button" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <button className="enrollment-button" type="button" onClick={next}>Continue <ArrowRight size={18} /></button>
      </div>
    </section>
  );
}
