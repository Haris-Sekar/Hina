import axios from 'axios';
import * as consts from '../Constants/CommonConstants';

const baseURL = import.meta.env.VITE_API_URL;

const API = axios.create({
    baseURL: `${baseURL}/api/v1/`,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});


API.interceptors.request.use(
    async (response) => {
        const token = localStorage.getItem(consts.token);
        if (token) {
            response.headers.Authorization = `Bearer ${token}`
        }
        return response;
    },
    (err) => {
        return Promise.reject(err);
    }
);
API.interceptors.response.use(
    async (res) => {
        return res;
    },
    (err) => {
        return Promise.reject(err.response.data)
    }
)
export { API };