import db from "../config/db.js";
import {INTERNAL_SERVER_ERR} from "../static/message.js";
import Size from "../models/Size.js";
import ItemGroup from "../models/ItemGroup.js";
import RateVersion from "../models/RateVersion.js";
import Rate from "../models/Rate.js";
import Product from "../models/Product.js";
import {createDeleteQuery, createUpdateQuery} from "../config/query.js";

export const createProduct = async (req, res) => {
	let respCode, response;
	createProductTry: try {
		await db.beginTransaction();

		let { itemName, itemGroupId, hsnCode, pcsPerUnit, unit, rateObject } = req.body;

		let missingFields = [
			!itemName ? "itemName" : "",
			!itemGroupId ? "itemGroupId" : "",
			!rateObject ? "rateObject" : "",
		];
		missingFields = missingFields.filter(function (element) {
			return element !== "";
		});

		if (missingFields.length > 0) {
			respCode = 409;
			response = {
				message: "field validation error, bellow fields are required",
				fields: missingFields,
			};
			await db.rollback();
			break createProductTry;
		}
		rateObject =
			typeof rateObject !== "object" ? JSON.parse(rateObject) : rateObject;

		if (!rateObject.rates || !rateObject.versionId) {
			respCode = 409;
			response = {
				message:
					"field validation error, rateObject should have versionId, costPrice and sellingPrice",
				fields: [rateObject],
			};
			await db.rollback();
			break createProductTry;
		}

		const productObject = new Product(itemName, hsnCode, itemGroupId, pcsPerUnit, unit);
		productObject.companyId = req.companyId;

		const result = await productObject.createProduct(req.userId);
		if (result.affectedRows > 0) {
			console.log(result);
			const parsedRateObject = Rate.getParsedRateObject(
				rateObject.rates,
				result.insertId,
				rateObject.versionId
			);
			const rateResult = await Rate.pushRateObject(
				parsedRateObject,
				req.userId,
				req.params.companyId
			);
			if (rateResult.length === rateObject.rates.length) {
				respCode = 201;
				response = {
					code: 201,
					message: "Product added successfully",
				};
			} else {
				respCode = 201;
				response = {
					code: 201,
					message: "Product added successfully, but some rates are not added",
				};
			}
		} else {
			respCode = 500;
			response = {
				code: 500,
				message: INTERNAL_SERVER_ERR,
			};
		}
		await db.commit();
	} catch (e) {
		await db.rollback();
		switch (e.code) {
			case "ER_NO_REFERENCED_ROW_2":
				respCode = 404;
				let fieldName;
				if (e.message.includes("item_group_id")) {
					fieldName = "itemGroupId";
				} else if (e.message.includes("size_id")) {
					fieldName = "sizeId (rateObject)";
				} else if (e.message.includes("rate_version_id")) {
					fieldName = "versionId (rateObject)";
				}
				response = {
					code: 404,
					message: `The given ${fieldName} is not available`,
				};
				break;
			case "ER_DUP_ENTRY":
				if (e.sql.includes("rate")) {
					response = {
						code: 409,
						message:
							"the rate for this size is already exists for this version",
					};
				}
				respCode = 409;
				break;
			default:
				respCode = 500;
				response = {
					code: 500,
					message: INTERNAL_SERVER_ERR,
				};
				break;
		}
		console.log(e);
	}
	res.status(respCode).json(response);
};

export const getProduct = async (req, res) => {
	let respCode, response;
	try {
		const { itemId, index, range, withRate } = req.query;
		const { companyId } = req.params;
		if (itemId != null) {
			// const itemDetails = await Product.getProduct(itemId);
			const itemDetails = await Rate.fetchProductWithRate(companyId, itemId);
			if (itemDetails == null) {
				respCode = 404;
				response = {
					message: "No item with that ID is available",
				};
			} else {
				const groupedByRateVersions =
					parseItemRateObjectsByVersion(itemDetails);

				respCode = 200;
				response = groupedByRateVersions;
			}
		} else if(withRate && withRate !== "undefined") {
			const itemDetails = await Rate.fetchProductWithRate(companyId, -1, index ? index : 0, range ? range : 1000);
			respCode = 200;
			const groupedByRateVersion = parseItemRateByItemAndRateVersion(itemDetails);
			response = {
				result: groupedByRateVersion
			}
		}else {
			const items = await Product.getProducts(companyId, index, range);
			if (items.length > 0) {
				respCode = 200;
				response = {
					result: items,
				};
			} else {
				respCode = 204;
				response = {};
			}
		}
	} catch (e) {
		console.log(e);
		respCode = 500;
		response = {
			code: 500,
			message: INTERNAL_SERVER_ERR,
		};
	}
	res.status(respCode).json(response);
};

export const getProductCount = async (req, res) => {
	let respCode, response;

	try {
		const { companyId } = req.params;
		const countResult = await Product.getProductCount(companyId);
		respCode = 200;
		response = { count: countResult.count };
	} catch (e) {
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}
	res.status(respCode).json(response);
};

export const updateProduct = async (req, res) => {
	let respCode, response;

	updateProductTry: try {
		await db.beginTransaction();

		const { name, itemGroupId, hsn, unit, pcsPerUnit } = req.body;
		let { rateObject } = req.body;
		const { itemId } = req.params;

		if (!name && !itemGroupId && !hsn && !rateObject) {
			respCode = 409;
			response = {
				code: 409,
				message:
					"field validation error any one of the following field is required",
				fields: ["name", "itemGroupId", "hsn", "rateObject"],
			};
			break updateProductTry;
		}
		if (rateObject) {
			rateObject = JSON.parse(rateObject);
			if (!rateObject.rates || !rateObject.versionId) {
				respCode = 409;
				response = {
					message:
						"field validation error, rateObject should have versionId, costPrice and sellingPrice ",
					fields: [rateObject],
				};
				await db.rollback();
				break updateProductTry;
			}
		}

		const productObj = new Product(name, hsn, itemGroupId, pcsPerUnit, unit);
		productObj.itemId = itemId;

		const result = await productObj.updateProduct(req.userId);

		if (result.affectedRows > 0) {
			if (rateObject) {
				const parsedRateObj = Rate.getParsedRateObject(
					rateObject.rates,
					itemId,
					rateObject.versionId
				);

				const rateResult = await Rate.updateRateObject(
					parsedRateObj,
					req.userId,
					req.params.companyId
				);
				if (rateResult.length === parsedRateObj.length) {
					respCode = 200;
					response = {
						message: "Product updated successfully",
						code: 200,
					};
				} else {
					respCode = 200;
					response = {
						message:
							"Product updated successfully, but some rates are not updated, contact support",
						code: 200,
					};
				}
			} else {
				respCode = 200;
				response = {
					message: "Product updated successfully",
					code: 200,
				};
			}
		} else {
			respCode = 500;
			response = {
				code: 500,
				message: INTERNAL_SERVER_ERR,
			};
		}
		await db.commit();
	} catch (e) {
		console.log(e);
		await db.rollback();
		respCode = 500;
		response = {
			code: 500,
			message: INTERNAL_SERVER_ERR,
		};
	}
	res.status(respCode).json(response);
};



export const deleteItems = async (req, res) => {
	let respCode, response;
	deleteItemGroupTry: try {
		await db.beginTransaction();
		const { ids } = req.query;

		if (!ids) {
			respCode = 403;
			response = {
				message: "Field validation error",
				fields: "ids should be provided",
			};
			break deleteItemGroupTry;
		}

		const query = createDeleteQuery(Product.tableName, ids, "item_id");

		const [result] = await db.query(query);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 204;
			response = {};
		} else {
			await db.commit();
			respCode = 404;
			response = {
				message: "No Item is available",
				code: 404,
			};
		}
	} catch (e) {
		await db.rollback();
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}

	res.status(respCode).json(response);
}


export const createSize = async (req, res) => {
	let respCode, response;
	addSizeTry: try {
		await db.beginTransaction();
		const { size } = req.body;

		if (!size) {
			respCode = 409;
			response = {
				message: "field validation error, bellow fields are required",
				fields: ["size"],
			};
			await db.rollback();
			break addSizeTry;
		}

		const sizeObj = new Size(size);

		sizeObj.companyId = req.companyId;

		const result = await sizeObj.addSize(req.userId);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 201;
			response = {
				message: "size added successfully",
				code: 201,
				sizeId: result.insertId,
			};
		} else {
			respCode = 500;
			response = {
				message: INTERNAL_SERVER_ERR,
				code: 500,
			};
		}
	} catch (e) {
		await db.rollback();
		if (e.code === "ER_DUP_ENTRY") {
			respCode = 409;
			response = {
				code: 409,
				message: "the given size is already added",
			};
		} else {
			respCode = 500;
			response = {
				code: 500,
				message: INTERNAL_SERVER_ERR,
			};
		}
	}
	res.status(respCode).json(response);
};

export const updateSize = async (req, res) => {
	let respCode, response;
	updateSizeTry: try {
		await db.beginTransaction();
		const { size } = req.body;
		const { sizeId } = req.params;
		if (!size) {
			await db.rollback();
			respCode = 409;
			response = {
				message: "field validation error, these fields should be required",
				fields: [!size ? "size" : ""],
				code: 409,
			};
			break updateSizeTry;
		}

		const sizeObj = new Size();
		sizeObj.size = size;
		sizeObj.sizeId = sizeId;
		sizeObj.companyId = req.companyId;

		const result = await sizeObj.updateSize(req.userId);
		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 200;
			response = {
				message: "size updated successfully",
				code: 200,
			};
		} else {
			respCode = 500;
			response = {
				message: INTERNAL_SERVER_ERR,
				code: 500,
			};
		}
	} catch (e) {
		await db.rollback();
		respCode = 500;
		response = {
			code: 500,
			message: INTERNAL_SERVER_ERR,
		};
	}
	res.status(respCode).json(response);
};

export const getSize = async (req, res) => {
	let respCode, response;

	try {
		const { sizeId } = req.query;
		const { companyId } = req.params;

		if (sizeId != null) {
			const sizeDetails = await Size.getSize(companyId, sizeId);
			if (sizeDetails == null) {
				respCode = 404;
				response = {
					message: "No size with that ID is available",
				};
			} else {
				respCode = 200;
				response = sizeDetails;
			}
		} else {
			const sizeDetails = await Size.getSizes(companyId);
			respCode = 200;
			response = {
				companyId: companyId,
				resultCount: sizeDetails.length,
				result: sizeDetails,
			};
		}
	} catch (e) {
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}
	res.status(respCode).json(response);
};

export const deleteSize = async (req, res) => {
	let respCode, response;
	deleteSizeTry: try {
		await db.beginTransaction();
		const { sizeId } = req.params;

		if (!sizeId) {
			respCode = 403;
			response = {
				message: "Field validation error",
				fields: "sizeId should be provided",
			};
			break deleteSizeTry;
		}

		const sizeObj = new Size();
		const result = await sizeObj.deleteSize(sizeId);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 204;
			response = {};
		} else {
			await db.commit();
			respCode = 404;
			response = {
				message: "No size with that ID is available",
				code: 404,
			};
		}
	} catch (e) {
		await db.rollback();
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}

	res.status(respCode).json(response);
};

export const deleteSizes = async (req, res) => {
	let respCode, response;
	deleteSizeTry: try {
		await db.beginTransaction();
		const { ids } = req.query;

		if (!ids) {
			respCode = 403;
			response = {
				message: "Field validation error",
				fields: "sizeId should be provided",
			};
			break deleteSizeTry;
		}

		const query = createDeleteQuery(Size.tableName, ids, "size_id");
		const [result] = await db.query(query);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 204;
			response = {};
		} else {
			await db.commit();
			respCode = 404;
			response = {
				message: "No size is available",
				code: 404,
			};
		}
	} catch (e) {
		await db.rollback();
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}

	res.status(respCode).json(response);
};

export const createItemGroup = async (req, res) => {
	let respCode, response;
	createItemGroupTry: try {
		await db.beginTransaction();
		const { name } = req.body;

		if (!name) {
			respCode = 409;
			response = {
				message: "field validation error, bellow fields are required",
				fields: ["name"],
			};
			await db.rollback();
			break createItemGroupTry;
		}

		const groupObj = new ItemGroup(name);

		groupObj.companyId = req.companyId;

		const result = await groupObj.addGroup(req.userId);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 201;
			response = {
				message: "Item Group added successfully",
				code: 201,
				itemGroupId: result.insertId,
			};
		} else {
			respCode = 500;
			response = {
				message: INTERNAL_SERVER_ERR,
				code: 500,
			};
		}
	} catch (e) {
		await db.rollback();
		if (e.code === "ER_DUP_ENTRY") {
			respCode = 409;
			response = {
				code: 409,
				message: "the given Item Group is already added",
			};
		} else {
			respCode = 500;
			response = {
				code: 500,
				message: INTERNAL_SERVER_ERR,
			};
		}
	}
	res.status(respCode).json(response);
};

export const updateItemGroup = async (req, res) => {
	let respCode, response;
	updateItemGroupTry: try {
		await db.beginTransaction();
		const { name } = req.body;
		const { groupId } = req.params;
		if (!name) {
			await db.rollback();
			respCode = 409;
			response = {
				message: "field validation error, these fields should be required",
				fields: [!name ? "name" : ""],
				code: 409,
			};
			break updateItemGroupTry;
		}

		const groupObj = new ItemGroup(name);
		groupObj.name = name;
		groupObj.groupId = groupId;
		groupObj.companyId = req.companyId;

		const result = await groupObj.updateGroup(req.userId);
		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 200;
			response = {
				message: "Item Group updated successfully",
				code: 200,
			};
		} else {
			respCode = 500;
			response = {
				message: INTERNAL_SERVER_ERR,
				code: 500,
			};
		}
	} catch (e) {
		await db.rollback();
		respCode = 500;
		response = {
			code: 500,
			message: INTERNAL_SERVER_ERR,
		};
	}
	res.status(respCode).json(response);
};

export const getItemGroup = async (req, res) => {
	let respCode, response;

	try {
		const { itemGroupId } = req.query;
		const { companyId } = req.params;

		if (itemGroupId != null) {
			const itemGroupDetails = await ItemGroup.getItemGroup(
				companyId,
				itemGroupId
			);
			if (itemGroupDetails == null) {
				respCode = 404;
				response = {
					message: "No item group with that ID is available",
				};
			} else {
				respCode = 200;
				response = itemGroupDetails;
			}
		} else {
			const itemGroupDetails = await ItemGroup.getItemGroups(companyId);
			respCode = 200;
			response = {
				companyId: companyId,
				resultCount: itemGroupDetails.length,
				result: itemGroupDetails,
			};
		}
	} catch (e) {
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}
	res.status(respCode).json(response);
};

export const deleteItemGroup = async (req, res) => {
	let respCode, response;
	deleteItemGroupTry: try {
		await db.beginTransaction();
		const { groupId } = req.params;

		if (!groupId) {
			respCode = 403;
			response = {
				message: "Field validation error",
				fields: "groupId should be provided",
			};
			break deleteItemGroupTry;
		}

		const groupObj = new ItemGroup();
		const result = await groupObj.deleteItemGroup(groupId);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 204;
			response = {};
		} else {
			await db.commit();
			respCode = 404;
			response = {
				message: "No Item group with that ID is available",
				code: 404,
			};
		}
	} catch (e) {
		await db.rollback();
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}

	res.status(respCode).json(response);
};

export const deleteItemGroups = async (req, res) => {
	let respCode, response;
	deleteItemGroupTry: try {
		await db.beginTransaction();
		const { ids } = req.query;

		if (!ids) {
			respCode = 403;
			response = {
				message: "Field validation error",
				fields: "ids should be provided",
			};
			break deleteItemGroupTry;
		}

		const query = createDeleteQuery(ItemGroup.tableName, ids, "group_id");

		const [result] = await db.query(query);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 204;
			response = {};
		} else {
			await db.commit();
			respCode = 404;
			response = {
				message: "No Item group is available",
				code: 404,
			};
		}
	} catch (e) {
		await db.rollback();
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}

	res.status(respCode).json(response);
};

export const createRateVersion = async (req, res) => {
	let respCode, response;
	createRateVersionTry: try {
		await db.beginTransaction();
		const { isDefault, name } = req.body;

		if (
			!isDefault &&
			!(isDefault === "true" || isDefault === "false") &&
			!name
		) {
			respCode = 409;
			response = {
				message: "field validation error, bellow fields are required",
				fields: ["isDefault", "name"],
			};
			await db.rollback();
			break createRateVersionTry;
		}

		if (isDefault === true) {
			const updateQuery = createUpdateQuery(
				RateVersion.tableName,
				{ is_default: false },
				`company_id=${req.companyId}`
			);
			await db.query(updateQuery);
		}

		const rateVersionObj = new RateVersion();
		rateVersionObj.isDefault = isDefault;
		rateVersionObj.name = name;
		rateVersionObj.companyId = req.companyId;

		const result = await rateVersionObj.addVersion(req.userId);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 201;
			response = {
				message: "Rate Version added successfully",
				code: 201,
				versionId: result.insertId,
			};
		} else {
			respCode = 500;
			response = {
				message: INTERNAL_SERVER_ERR,
				code: 500,
			};
		}
	} catch (e) {
		await db.rollback();

		respCode = 500;
		response = {
			code: 500,
			message: INTERNAL_SERVER_ERR,
		};
	}
	res.status(respCode).json(response);
};

export const updateRateVersion = async (req, res) => {
	let respCode, response;
	updateRateVersionTry: try {
		await db.beginTransaction();
		const { isDefault, name } = req.body;
		const { versionId } = req.params;
		if (isDefault === undefined || isDefault === null) {
			await db.rollback();
			respCode = 409;
			response = {
				message: "field validation error, these fields should be required",
				fields: [!isDefault ? "isDefault" : ""],
				code: 409,
			};
			break updateRateVersionTry;
		}
		if (isDefault === true) {
			const updateQuery = createUpdateQuery(
				RateVersion.tableName,
				{ is_default: false },
				`company_id=${req.companyId}`
			);
			await db.query(updateQuery);
		}

		const rateVersionObj = new RateVersion();
		rateVersionObj.isDefault = isDefault;
		rateVersionObj.versionId = versionId;
		rateVersionObj.name = name;
		rateVersionObj.companyId = req.companyId;

		const result = await rateVersionObj.updateVersion(req.userId);
		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 200;
			response = {
				message: "Rate Version updated successfully",
				code: 200,
			};
		} else {
			respCode = 500;
			response = {
				message: INTERNAL_SERVER_ERR,
				code: 500,
			};
		}
	} catch (e) {
		await db.rollback();
		respCode = 500;
		response = {
			code: 500,
			message: INTERNAL_SERVER_ERR,
		};
	}
	res.status(respCode).json(response);
};

export const getRateVersion = async (req, res) => {
	let respCode, response;

	try {
		const { versionId } = req.query;
		const { companyId } = req.params;

		if (versionId != null) {
			const versionDetails = await RateVersion.getVersion(companyId, versionId);
			if (versionDetails == null) {
				respCode = 404;
				response = {
					message: "No rate version with that ID is available",
				};
			} else {
				respCode = 200;
				response = versionDetails;
			}
		} else {
			const versionDetails = await RateVersion.getVersions(companyId);
			respCode = 200;
			response = {
				companyId: companyId,
				resultCount: versionDetails.length,
				result: versionDetails,
			};
		}
	} catch (e) {
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}
	res.status(respCode).json(response);
};

export const deleteRateVersion = async (req, res) => {
	let respCode, response;
	deleteRateTry: try {
		await db.beginTransaction();
		const { versionId } = req.params;

		if (!versionId) {
			respCode = 403;
			response = {
				message: "Field validation error",
				fields: "versionId should be provided",
			};
			break deleteRateTry;
		}

		const versionObj = new RateVersion();
		const result = await versionObj.deleteVersion(versionId);

		if (result.affectedRows > 0) {
			z;
			await db.commit();
			respCode = 204;
			response = {};
		} else {
			await db.commit();
			respCode = 404;
			response = {
				message: "No rate version with that ID is available",
				code: 404,
			};
		}
	} catch (e) {
		await db.rollback();
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}

	res.status(respCode).json(response);
};

export const deleteRateVersions = async (req, res) => {
	let respCode, response;
	deleteRateVersionsTry: try {
		await db.beginTransaction();
		const { ids } = req.query;

		if (!ids) {
			respCode = 403;
			response = {
				message: "Field validation error",
				fields: "ids should be provided",
			};
			break deleteRateVersionsTry;
		}

		const query = createDeleteQuery(RateVersion.tableName, ids, "version_id");

		const [result] = await db.query(query);

		if (result.affectedRows > 0) {
			await db.commit();
			respCode = 204;
			response = {};
		} else {
			await db.commit();
			respCode = 404;
			response = {
				message: "No rate version is available",
				code: 404,
			};
		}
	} catch (e) {
		await db.rollback();
		response = {
			message: e.message,
			code: 500,
		};
		respCode = 500;
	}

	res.status(respCode).json(response);
};

export const addRateToVersion = async (req, res) => {
	let respCode, response;
	addRateToVersionTry: try {
		const { rateObject } = req.body;

		const parsedRateObj = Rate.getParsedRateObject(
			rateObject.rates,
			rateObject
		);
	} catch (e) {
		respCode = 500;
		response = {
			code: 500,
			message: INTERNAL_SERVER_ERR,
		};
	}

	res.status(respCode).json(response);
};

function parseItemRateObjectsByVersion(data) {
 	const itemDetails = {
		itemId: data[0].itemId,
		itemName: data[0].itemName,
		hsnCode: data[0].hsnCode,
		unit: data[0].unit,
		pcsPerUnit: data[0].pcsPerUnit,
		item_group: data[0].item_group,
		createdBy: data[0].createdBy,
		createdTime: data[0].createdTime,
		updatedBy: data[0].updatedBy,
		updatedTime: data[0].updatedTime,
		companyId: data[0].companyId,
	};

	const rateVersionsMap = new Map();

	data.forEach((item) => {
		const rateVersionKey = item.versionId;

		if (!rateVersionsMap.has(rateVersionKey)) {
			rateVersionsMap.set(rateVersionKey, {
				versionId: item.versionId,
				rateVersionName: item.rateVersionName,
				rateVersionIsDefault: item.rateVersionIsDefault,
				rateVersionCreatedBy: item.rateVersionCreatedBy,
				rateVersionCreatedTime: item.rateVersionCreatedTime,
				rateVersionUpdatedBy: item.rateVersionUpdatedBy,
				rateVersionUpdatedTime: item.rateVersionUpdatedTime,
				rates: [],
			});
		}

		rateVersionsMap.get(rateVersionKey).rates.push({
			size: {
				sizeId: item.sizeId,
				size: item.size,
			},
			costPrice: item.costPrice,
			sellingPrice: item.sellingPrice,
			rateCreatedBy: item.rateCreatedBy,
			rateCreatedTime: item.rateCreatedTime,
			rateUpdatedBy: item.rateUpdatedBy,
			rateUpdatedTime: item.rateUpdatedTime,
		});
	});

	const rateVersions = Array.from(rateVersionsMap.values());

	return { itemDetails, rateVersions };
}

const parseItemRateByItemAndRateVersion = (dataObject) => {
	const items = {};

	dataObject.forEach((item) => {
		const itemDetails = items[item.itemId];
	 let itemDets = itemDetails?.itemDetails;
		if(!itemDets) {
			itemDets = {
				itemId: item.itemId,
				itemName: item.itemName,
				hsnCode: item.hsnCode,
				unit: item.unit,
				pcsPerUnit: item.pcsPerUnit,
				item_group: item.item_group,
				createdBy: item.createdBy,
				createdTime: item.createdTime,
				updatedBy: item.updatedBy,
				updatedTime: item.updatedTime,
				companyId: item.companyId,
			}
		}

		let rateVersions = itemDetails?.rates;

		if(!rateVersions) {
			rateVersions = new Map();
		} else {
			rateVersions = new Map(Object.entries(rateVersions));
		}

		if(!rateVersions.has(String(item.versionId))) {
			rateVersions.set(String(item.versionId), {
				versionId: item.versionId,
				rateVersionName: item.rateVersionName,
				rateVersionIsDefault: item.rateVersionIsDefault,
				rateVersionCreatedBy: item.rateVersionCreatedBy,
				rateVersionCreatedTime: item.rateVersionCreatedTime,
				rateVersionUpdatedBy: item.rateVersionUpdatedBy,
				rateVersionUpdatedTime: item.rateVersionUpdatedTime,
				rates: [],
			});
		}

		rateVersions.get(String(item.versionId)).rates.push({
			size: {
				sizeId: item.sizeId,
				size: item.size,
			},
			costPrice: item.costPrice,
			sellingPrice: item.sellingPrice,
			rateCreatedBy: item.rateCreatedBy,
			rateCreatedTime: item.rateCreatedTime,
			rateUpdatedBy: item.rateUpdatedBy,
			rateUpdatedTime: item.rateUpdatedTime,
		});
		items[item.itemId] = {
			itemDetails: itemDets,
			rates: Object.fromEntries(rateVersions)
		}
	});
	return Object.values(items);
}