import api from "./axios";

export const dashboardApi = {
    summary: () => api.get("/dashboard/summary"),
};
