import { ArrowLeft, ArrowRight, Car, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import EnrollmentProgress from './EnrollmentProgress';
import FormField from './FormField';
import SelectField from './SelectField';

const COLORS = ['Black', 'White', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Brown', 'Other'];

function validateVehicles(vehicles) {
  return vehicles.map((vehicle) => {
    const errors = {};
    if (vehicle.plate.trim().length < 3) errors.plate = 'Enter a valid plate number.';
    if (!COLORS.includes(vehicle.color)) errors.color = 'Choose the vehicle color.';
    return errors;
  });
}

export default function VehiclesStep({ vehicles, onChange, onBack, onContinue }) {
  const [errors, setErrors] = useState([]);
  const addVehicle = () => onChange([...vehicles, { id: crypto.randomUUID(), plate: '', color: '', make: '' }]);
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
