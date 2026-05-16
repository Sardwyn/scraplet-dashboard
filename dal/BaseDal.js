// dal/BaseDal.js
import db from "../db.js";

export class BaseDal {
  /**
   * Initialize a new BaseDal enforcing multi-tenancy by user_id
   * @param {number|string} userId 
   * @param {string} tableName 
   */
  constructor(userId, tableName) {
    if (!userId) throw new Error("userId is required for DAL to ensure multi-tenancy");
    if (!tableName) throw new Error("tableName is required for DAL");
    this.userId = userId;
    this.tableName = tableName;
    this.db = db;
  }

  async findById(id, cols = "*") {
    const { rows } = await this.db.query(
      `SELECT ${cols} FROM ${this.tableName} WHERE id = $1 AND user_id = $2`,
      [id, this.userId]
    );
    return rows[0] || null;
  }

  async findMany(conditions = {}, cols = "*", orderBy = "") {
    const keys = Object.keys(conditions);
    const values = [this.userId];
    let whereClause = `WHERE user_id = $1`;
    
    keys.forEach((k, i) => {
      whereClause += ` AND ${k} = $${i + 2}`;
      values.push(conditions[k]);
    });

    const { rows } = await this.db.query(
      `SELECT ${cols} FROM ${this.tableName} ${whereClause} ${orderBy}`,
      values
    );
    return rows;
  }

  async update(id, updates, returning = "*") {
    const keys = Object.keys(updates);
    if (keys.length === 0) return null;

    const values = [];
    const setClause = [];
    
    keys.forEach((k, i) => {
      setClause.push(`${k} = $${i + 1}`);
      values.push(updates[k]);
    });
    
    // Always append updated_at if mutating
    setClause.push(`updated_at = NOW()`);
    
    values.push(id);
    values.push(this.userId);
    
    const { rows } = await this.db.query(
      `UPDATE ${this.tableName} SET ${setClause.join(", ")} WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING ${returning}`,
      values
    );
    return rows[0] || null;
  }

  async delete(id) {
    const { rowCount } = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1 AND user_id = $2`,
      [id, this.userId]
    );
    return rowCount > 0;
  }
  
  async insert(data, returning = "*") {
    const keys = Object.keys(data);
    const values = [this.userId];
    const columns = ["user_id"];
    const placeholders = ["$1"];
    
    keys.forEach((k, i) => {
      columns.push(k);
      placeholders.push(`$${i + 2}`);
      values.push(data[k]);
    });
    
    const { rows } = await this.db.query(
      `INSERT INTO ${this.tableName} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${returning}`,
      values
    );
    return rows[0] || null;
  }
}
