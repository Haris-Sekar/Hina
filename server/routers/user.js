import express from "express";
import * as users from "../controllers/user.js";
import validation from "../middleware/validation/validation.js";
import * as validator from "../middleware/validation/validators.js";

const router = express.Router();

router.post('/signup', validation(validator.signup), users.signup);
router.post('/login', validation(validator.login), users.login);
router.post("/verify", validation(validator.verify), users.accountVerify);
router.put("/resend-mail", validation(validator.resendMail), users.resendMail)

export default router;
