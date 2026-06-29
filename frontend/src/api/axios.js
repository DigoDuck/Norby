import axios from "axios";
import { useAuthStore } from "../store/authStore";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor para adicionar o token de autenticação em cada requisição
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Refresh token automático em 401 ---
// Ao receber 401 num endpoint não-auth, tenta UMA vez renovar o access token via
// /auth/refresh. Requests concorrentes durante a renovação entram numa fila para
// não disparar N refreshes ao mesmo tempo.
let isRefreshing = false;
let pendingQueue = [];

function flushQueue(error, token) {
  pendingQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)));
  pendingQueue = [];
}

function forceLogout() {
  useAuthStore.getState().logout();
  window.location.href = "/";
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const url = original.url || "";
    // login/register/refresh não passam pelo fluxo de renovação:
    // - login/register: o catch do componente exibe a mensagem de erro;
    // - refresh: se ele falha, não há o que renovar.
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");

    if (error.response?.status !== 401 || isAuthEndpoint || original._retry) {
      return Promise.reject(error);
    }

    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) {
      forceLogout();
      return Promise.reject(error);
    }

    // Já existe um refresh em andamento: enfileira esta request.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;
    try {
      // Chamada "crua" (sem interceptors) para evitar recursão.
      const { data } = await axios.post(`${baseURL}/auth/refresh`, {
        refresh_token: refreshToken,
      });
      useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
      flushQueue(null, data.access_token);
      original.headers.Authorization = `Bearer ${data.access_token}`;
      return api(original);
    } catch (refreshError) {
      flushQueue(refreshError, null);
      forceLogout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
