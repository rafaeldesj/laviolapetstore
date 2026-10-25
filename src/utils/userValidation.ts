import { workerCallPublic } from './workerApi';

/**
 * Confere duplicidade de e-mail/celular/apelido no cadastro. Antes isso consultava o Firestore direto do navegador,
 * o que exigia deixar o cadastro de TODO MUNDO com leitura pública. Agora quem consulta é o Worker, que só devolve
 * "existe ou não" — nunca a lista de usuários.
 */
const check = (field: 'email' | 'phone' | 'username', value: string, excludeId?: string): Promise<boolean> =>
  workerCallPublic<{ exists: boolean }>(`/auth/check?field=${field}&value=${encodeURIComponent(value.trim())}${excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : ''}`)
    .then(r => r.exists)
    .catch(() => false); // serviço fora do ar: não trava o cadastro por isso

export const checkEmailExists = (email: string, excludeId?: string): Promise<boolean> => check('email', email, excludeId);
export const checkPhoneExists = (phone: string, excludeId?: string): Promise<boolean> => check('phone', phone, excludeId);
export const checkUsernameExists = (username: string, excludeId?: string): Promise<boolean> => check('username', username, excludeId);

export const generateUsernameSuggestions = (baseUsername: string): Promise<string[]> =>
  workerCallPublic<{ suggestions: string[] }>(`/auth/suggest-username?base=${encodeURIComponent(baseUsername.trim())}`)
    .then(r => r.suggestions)
    .catch((): string[] => []);
