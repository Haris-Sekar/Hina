import { number, object, string } from "yup";

export const signup = object({
	name: string().required(),
	email: string().email().required(),
	mobile: string().required().length(10),
	password: string().required().min(6).strict(),
	confirmPassword: string().required().min(6).strict(),
});

export const login = object({
	email: string().email().required(),
	password: string().required().min(6),
});

export const verify = object({
	token: string().required(),
});

export const resendMail = object({
	email: string().email().required(),
});

export const addCustomer = object({
	companyName: string().required(),
	firstName: string().required(),
	lastName: string(),
	phoneNumber: string().required().length(10),
	email: string().email(),
	gstNumber: string().length(15),
	address1: string().required(),
	address2: string(),
	mainAreaId: string().required().length(7),
});
