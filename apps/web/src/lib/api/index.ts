import { publicEnvironment } from '../../config/public-environment.js';

import { ApiClient } from './api-client.js';

export const apiClient = new ApiClient({
  baseUrl: publicEnvironment.VITE_API_BASE_URL,
});

export { ApiClient, ApiClientError } from './api-client.js';
