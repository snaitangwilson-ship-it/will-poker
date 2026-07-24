"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAction = validateAction;
function validateAction(socket, data) {
    const userId = socket.data.userId;
    if (!userId)
        return false;
    if (data.userId !== userId)
        return false;
    if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount < 0))
        return false;
    if (!['fold', 'check', 'call', 'raise', 'all_in'].includes(data.action))
        return false;
    return true;
}
