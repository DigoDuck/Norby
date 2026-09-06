import axios from "axios";
import { useAuthStore } from "../store/authStore";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  // O cookie de refresh só existe em /auth (Path=/auth), então isso não muda
  // nada nas outras rotas (#110).
  withCredentials: true,
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
// /auth/refresh.

// Renovação única por aba e serializada entre abas (#110). O refresh
// rotaciona o token do cookie, e apresentar o token antigo de novo é lido
// pelo backend como roubo: derruba TODAS as sessões. Duas abas restaurando
// ao mesmo tempo (ou o StrictMode em dev) fariam exatamente isso sem isto.
let inflightRefresh = null;

export async function refreshAccessToken() {
  if (inflightRefresh) return inflightRefresh;
  const run = async () => {
    // Chamada "crua" (sem interceptors) para evitar recursão. Sem corpo: o
    // refresh token vai no cookie HttpOnly.
    const { data } = await axios.post(`${baseURL}/auth/refresh`, null, { withCredentials: true });
    useAuthStore.getState().setToken(data.access_token);
    return data.access_token;
  };
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  inflightRefresh = (locks?.request ? locks.request("norby-auth-refresh", run) : run()).finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
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

    original._retry = true;
    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      forceLogout();
      return Promise.reject(refreshError);
    }
  },
);

export default api;
