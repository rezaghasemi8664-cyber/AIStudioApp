const prisma = require('./db.service.cjs');

module.exports = {
  async createTheme({ name, data }) {
    return prisma.themeConfig.create({
      data: {
        name,
        dataJson: JSON.stringify(data || {})
      }
    });
  },

  async listThemes() {
    return prisma.themeConfig.findMany({
      orderBy: { id: "desc" }
    });
  },

  async updateTheme(id, data) {
    return prisma.themeConfig.update({
      where: { id },
      data: {
        dataJson: JSON.stringify(data || {})
      }
    });
  },

  async deleteTheme(id) {
    return prisma.themeConfig.delete({ where: { id } });
  }
};
