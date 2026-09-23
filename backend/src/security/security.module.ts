import { Global, Module } from '@nestjs/common';
import { SecretCipherService } from './secret-cipher.service';
import { StreamTokenService } from './stream-token.service';

@Global()
@Module({ providers: [SecretCipherService, StreamTokenService], exports: [SecretCipherService, StreamTokenService] })
export class SecurityModule {}
