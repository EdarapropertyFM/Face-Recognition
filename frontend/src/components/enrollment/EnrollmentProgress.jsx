export default function EnrollmentProgress({ currentStep, totalSteps }) {
  return (
    <div className="enrollment-progress" role="progressbar" aria-label="Enrollment progress"
      aria-valuemin="1" aria-valuemax={totalSteps} aria-valuenow={currentStep}>
      {Array.from({ length: totalSteps }, (_, index) => {
        const number = index + 1;
        const state = number < currentStep ? 'complete' : number === currentStep ? 'current' : '';
        return <span className={state} key={number} aria-hidden="true" />;
      })}
    </div>
  );
}
