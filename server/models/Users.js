import db from "../config/db.js";
import {createInsertQuery, createUpdateQuery, generateUniqueId} from "../config/query.js";
import jwt from "jsonwebtoken";
export default class Users {
  userId;
  name;
  email;
  mobile;
  password;
  isVerified;
  static tableName = "users"
  constructor(name, email, mobile, password, isVerified) {
    this.name = name;
    this.email = email;
    this.mobile = mobile;
    this.password = password;
    this.isVerified = isVerified;
  }

  setName(name) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error("Name must be a non-empty string");
    }
    this.name = name;
  }

  setEmail(email) {
    this.email = email;
  }

  setMobile(mobile) {
    this.mobile = mobile;
  }

  setPassword(password) {
    this.password = password;
  }

  setIsVerified(isVerified) {
    if (typeof isVerified !== "boolean") {
      throw new Error("isVerified must be a boolean");
    }
    this.isVerified = isVerified;
  }

  async serializeToSQLQuery() {
    const userId = await generateUniqueId(Users.tableName, "user_id")
    const jsonObject = {
      user_id: userId,
      name: this.name,
      email: this.email,
      mobile: this.mobile,
      password: this.password,
      is_verified: this.isVerified,
    };

    if (this.userId != undefined) {
      jsonObject.user_id = this.userId;
    }

    return jsonObject;
  }

  static fromJSON(json) {
    const { user_id, name, email, mobile, password, is_verified } = json;

    const user = new Users(name, email, mobile, password, is_verified);

    if (user_id !== undefined) {
      user.userId = user_id;
    }
 
    return user;
  }

  async getUserDetails(index = 0, range = 1) {
    const query = `select * from users where email='${this.email}' ${
      this.mobile !== undefined ? `or mobile='${this.mobile}'` : ""
    }  limit ${index},${range};`;

    const [result] = await db.query(query);

    if (result.length > 0) {
      return Users.fromJSON(result[0]);
    } else {
      return null;
    }
  }

  async createUser() {
    const query = createInsertQuery("users",await this.serializeToSQLQuery());

    const [result] = await db.query(query);

    return result;
  }

  async updateUser(updateObj, condition) {
    const query = createUpdateQuery("users", updateObj, condition);

    const [result] = await db.query(query);

    return result;
  }

  createToken() {
    return jwt.sign(
      {
        id: this.userId,
        email: this.email,
        name: this.name,
        isVerified: this.isVerified,
      },
      process.env.PRIVATEKEY
    );
  }

  static getUserPojo(tokenObj) {
    try{
      const user = new Users();
      user.userId = tokenObj.id;
      user.email = tokenObj.email;
      user.name = tokenObj.name;
      user.isVerified = tokenObj.isVerified;
      return user;
    } catch (e) {
      throw new Error("Invalid Token")
    }


  }

  static async getUserDetails(userId) {
    const query = `select * from users where user_id=${userId} limit 0,1`;

    const [ result ] = await db.query(query);

    if(result.length !== 1) {
      return null;
    }

    return {
      userId: result[0].user_id,
      email: result[0].email,
      name: result[0].name,
      mobile: result[0].mobile
    }
  }

  static async getUserDetail(emailId, phoneNumber) {
    const query = `select * from users where ${emailId !== undefined ? `email = "${emailId}"` : phoneNumber !== undefined ? `mobile="${phoneNumber}"`: ''}`;
    const [result] = await db.query(query)
    if(result.length > 0) {
      return Users.fromJSON(result[0]);
    }
    return null;
  }


  getUserJSON() {
    return {
      userId: this.userId,
      email: this.email,
      name: this.name,
      mobile: this.mobile
    }
  }

}
