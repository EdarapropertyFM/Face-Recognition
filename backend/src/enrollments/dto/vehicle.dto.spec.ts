import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEnrollmentDto } from './create-enrollment.dto';

const IMAGE = 'data:image/jpeg;base64,AAAA';

async function carErrors(cars: unknown[]) {
  const dto = plainToInstance(CreateEnrollmentDto, { cars });
  // Same options the global pipe in main.ts uses, so this test fails
  // exactly when a real request would be rejected.
  const errors = await validate(dto, { whitelist: true });
  return errors.find((error) => error.property === 'cars');
}

describe('vehicle licence validation', () => {
  it('rejects a vehicle with no licence attached', async () => {
    expect(await carErrors([{ plate: 'ABC 123', color: 'Black', make: '' }])).toBeDefined();
  });

  it('rejects a licence that is not an image we stored', async () => {
    expect(await carErrors([{ plate: 'ABC 123', color: 'Black', licence: 'https://example.com/x.jpg' }])).toBeDefined();
  });

  it('accepts a vehicle whose licence is an uploaded image', async () => {
    expect(await carErrors([{ plate: 'ABC 123', color: 'Black', licence: IMAGE }])).toBeUndefined();
  });

  it('accepts an already-stored licence reference on update', async () => {
    expect(await carErrors([{ plate: 'ABC 123', color: 'Black', licence: 'asset://STMC-1/vehicle-1-licence.enc' }])).toBeUndefined();
  });
});
