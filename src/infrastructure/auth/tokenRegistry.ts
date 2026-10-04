import { TokenService } from '../../application/auth/TokenService';
import { TokenMysqlRepository } from '../repositories/TokenMysqlRepository';

/** Process-wide instance: the LRU cache must be shared by every issuer and validator of tokens. */
export const tokenService = new TokenService(new TokenMysqlRepository());
