import { ArrowLeft, ArrowRight, Car, CheckCircle2, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import EnrollmentProgress from './EnrollmentProgress';
import FormField from './FormField';
import SelectField from './SelectField';
import { compressImageFile } from '../../utils/image';

const COLORS = ['Black', 'White', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Brown', 'Other'];
const LICENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LICENCE_MAX_BYTES = 5 * 1024 * 1024;

export function validateVehicles(vehicles) {
  return vehicles.map((vehicle) => {
    const errors = {};
    if (vehicle.plate.trim().length < 3) errors.plate = 'Enter a valid plate number.';
    if (!COLORS.includes(vehicle.color)) errors.color = 'Choose the vehicle color.';
    // A vehicle is only allowed through the gate because its licence was
    // checked, so the picture of it is not optional. Adding no vehicle at
    // all is still fine -- this only applies once one is listed.
    if (!vehicle.licence) errors.licence = 'Upload the vehicle licence.';
    return errors;
  });
}

export default function VehiclesStep({ vehicles, onChange, onBack, onContinue }) {
  const [errors, setErrors] = useState([]);
  const addVehicle = () => onChange([...vehicles,
    { id: crypto.randomUUID(), plate: '', color: '', make: '', licence: '', licenceName: '' }]);

  const attachLicence = async (index, file) => {
    if (!file) return;
    if (!LICENCE_TYPES.includes(file.type)) {
      setErrors((current) => current.map((entry, i) =>
        i === index ? { ...entry, licence: 'Use a JPG, PNG or WebP image.' } : entry));
      return;
    }
    if (file.size > LICENCE_MAX_BYTES) {
      setErrors((current) => current.map((entry, i) =>
        i === index ? { ...entry, licence: 'The image must be 5 MB or smaller.' } : entry));
      return;
    }
    try {
      // Stored as a compressed data URL, like the National ID card, so a
      // resumed draft still carries it -- a File cannot be serialised.
      const image = await compressImageFile(file);
      onChange(vehicles.map((vehicle, i) =>
        i === index ? { ...vehicle, licence: image, licenceName: file.name } : vehicle));
      setErrors((current) => current.map((entry, i) =>
        i === index ? { ...entry, licence: undefined } : entry));
    } catch {
      setErrors((current) => current.map((entry, i) =>
        i === index ? { ...entry, licence: 'Could not read that image.' } : entry));
    }
  };
  const updateVehicle = (index, field, value) => {
    onChange(vehicles.map((vehicle, vehicleIndex) => vehicleIndex === index ? { ...vehicle, [field]: value } : vehicle));
    setErrors((current) => current.map((entry, errorIndex) => errorIndex === index ? { ...entry, [field]: undefined } : entry));
  };
  const removeVehicle = (index) => {
    onChange(vehicles.filter((_, vehicleIndex) => vehicleIndex !== index));
    setErrors((current) => current.filter((_, errorIndex) => errorIndex !== index));
  };
  const next = () => {
    const nextErrors = validateVehicles(vehicles);
    setErrors(nextErrors);
    if (nextErrors.every((entry) => Object.keys(entry).length === 0)) onContinue();
  };

  return (
    <section className="enrollment-card" aria-labelledby="vehicles-title">
      <EnrollmentProgress currentStep={4} totalSteps={5} />
      <p className="enrollment-step-label">Step 4 of 5 · Vehicles</p>
      <h1 id="vehicles-title">Your vehicles</h1>
      <p className="enrollment-subtitle">Add vehicles associated with your unit, or continue without one.</p>
      {vehicles.length ? vehicles.map((vehicle, index) => (
        <article className="enrollment-entry" key={vehicle.id}>
          <div className="enrollment-entry-header">
            <span><Car size={17} /> Vehicle {index + 1}</span>
            <button type="button" onClick={() => removeVehicle(index)} aria-label={`Remove vehicle ${index + 1}`}><Trash2 size={17} /></button>
          </div>
          <div className="enrollment-grid">
            <FormField id={`vehicle-plate-${vehicle.id}`} label="Plate number" value={vehicle.plate}
              error={errors[index]?.plate} required onChange={(event) => updateVehicle(index, 'plate', event.target.value.toUpperCase())} />
            <SelectField id={`vehicle-color-${vehicle.id}`} label="Color" value={vehicle.color}
              error={errors[index]?.color} options={COLORS} placeholder="Select color" required
              onChange={(event) => updateVehicle(index, 'color', event.target.value)} />
          </div>
          <FormField id={`vehicle-make-${vehicle.id}`} label="Make / model (optional)" value={vehicle.make}
            onChange={(event) => updateVehicle(index, 'make', event.target.value)} />

          <div className={`enrollment-document ${errors[index]?.licence ? 'has-error' : ''}`}>
            <span className="enrollment-document-label">Vehicle licence *</span>
            <label htmlFor={`vehicle-licence-${vehicle.id}`}>
              {vehicle.licence ? <CheckCircle2 size={22} aria-hidden="true" /> : <Upload size={22} aria-hidden="true" />}
              <span>
                <strong>{vehicle.licenceName || (vehicle.licence ? 'Licence attached' : 'Upload vehicle licence')}</strong>
                <small>{vehicle.licence ? 'Attached to this registration.' : 'JPG, PNG or WebP · maximum 5 MB'}</small>
              </span>
              <input id={`vehicle-licence-${vehicle.id}`} type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(event) => attachLicence(index, event.target.files?.[0] ?? null)} />
            </label>
            {errors[index]?.licence ? <p className="enrollment-field-error">{errors[index].licence}</p> : null}
          </div>
        </article>
      )) : <div className="enrollment-empty"><Car size={28} /><strong>No vehicles added</strong><span>You can continue without adding a vehicle.</span></div>}
      <button className="enrollment-add-button" type="button" onClick={addVehicle}><Plus size={18} /> Add vehicle</button>
      <div className="enrollment-actions">
        <button className="enrollment-button secondary" type="button" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <button className="enrollment-button" type="button" onClick={next}>Review application <ArrowRight size={18} /></button>
      </div>
    </section>
  );
}
