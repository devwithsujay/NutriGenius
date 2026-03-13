export const API_BASE = "/api";

export const fetchAPI = async (endpoint: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem("token");

    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "API request failed");
    }

    return response.json();
};

export const runFeature = async (featureId: string, prompt?: string, extraInputs?: any) => {
    const data = await fetchAPI(`/features/${featureId}`, {
        method: "POST",
        body: JSON.stringify({ prompt, extra_inputs: extraInputs }),
    });
    return data.markdown;
};

export const runVisionFeature = async (imageBase64: string) => {
    const data = await fetchAPI(`/features/vision/food_photo`, {
        method: "POST",
        body: JSON.stringify({ image_base64: imageBase64 }),
    });
    return data.markdown;
};
