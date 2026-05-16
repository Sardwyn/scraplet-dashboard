// dal/OverlayDal.js
import { BaseDal } from "./BaseDal.js";

export class OverlayDal extends BaseDal {
  constructor(userId) {
    super(userId, "overlays");
  }

  async findByPublicId(publicId) {
    const { rows } = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE public_id = $1 AND user_id = $2`,
      [publicId, this.userId]
    );
    return rows[0] || null;
  }
}
