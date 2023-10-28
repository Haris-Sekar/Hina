import {createInsertQuery, createUpdateQuery, generateUniqueId} from "../config/query.js";
import db from "../config/db.js";

export default class Size{
    sizeId;
    size;
    createdBy;
    createdTime;
    updatedBy;
    updatedTime;
    companyId;
    static tableName = "size";

    constructor(size) {
        this.size = size;
    }

    toJSON() {
        return {
            sizeId: this.sizeId,
            size: this.size,
            createdBy: this.createdBy,
            createdTime: new Date(this.createdTime).toLocaleString(),
            updatedBy: this.updatedBy,
            updatedTime: new Date(this.updatedTime).toLocaleString(),
            companyId: this.companyId
        }
    }

    static async deserializeFromJSON(json) {
        const size = new Size(json.size);
        size.sizeId = json.size_id;
        size.createdBy = json.created_by;
        size.createdTime = json.created_time;
        size.updatedBy = json.updated_by;
        size.updatedTime = json.updated_time;
        size.companyId = json.company_id;
    }

    async serializeToSQLQuery(userId, isUpdate) {
        const sizeId = !isUpdate ? await generateUniqueId(Size.tableName, "size_id") : this.sizeId;
        const currentMillis = Date.now();
        const json = {
            size_id: sizeId,
            size: this.size,
            created_by: !isUpdate ? userId : this.createdTime,
            updated_by: userId,
            created_time: !isUpdate ? currentMillis: this.createdTime,
            updated_time: currentMillis,
            company_id: this.companyId
        }
        for (const key in json) {
            if (json[key] === undefined) {
                delete json[key];
            }
        }
        return json;
    }

    async addSize(userId) {
        const query = createInsertQuery(Size.tableName, await this.serializeToSQLQuery(userId, false));
        const [result] = await db.query(query);
        return result;
    }

    async updateSize(userId) {
        const query = createUpdateQuery(Size.tableName, await this.serializeToSQLQuery(userId, true),`size_id=${this.sizeId}`);
        const [result] = await db.query(query);
        return result;
    }




}