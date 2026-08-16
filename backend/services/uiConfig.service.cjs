const { prisma } = require('./db.service.cjs');

// تابع کمکی برای پیدا کردن مدل صحیح فارغ از حروف کوچک/بزرگ
function getUiConfigModel() {
    const model = prisma.uiConfig || prisma.uIConfig;
    if (!model) {
        throw new Error('Prisma model (uiConfig) is not defined in the client.');
    }
    return model;
}

function safeParse(value) {
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return value;
    }
}

module.exports = {
    async setConfig(key, valueObj) {
        const model = getUiConfigModel();
        const record = await model.upsert({
            where: { key },
            update: { valueJson: JSON.stringify(valueObj), updatedAt: new Date() },
            create: { key, valueJson: JSON.stringify(valueObj) }
        });
        return { ...record, value: safeParse(record.valueJson) };
    },

    async getConfig(key) {
        const model = getUiConfigModel();
        const record = await model.findUnique({ where: { key } });
        if (!record) return null;
        return { ...record, value: safeParse(record.valueJson) };
    },

    async getAll() {
        const model = getUiConfigModel();
        const records = await model.findMany({ orderBy: { key: 'asc' } });
        return records.map(record => ({
            ...record,
            value: safeParse(record.valueJson)
        }));
    }
};
