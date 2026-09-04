import React from 'react';
import AdminPanel from './AdminPanel';

interface UserManagementProps {
  isOnline: boolean;
  onMessageUpdate: () => void;
  onlineCount: number;
}

/**
 * Backward-compatible entry point for the existing admin tab.
 * The old user-management implementation lives in UserManagementLegacy
 * and is embedded by the new centralized administration panel.
 */
const UserManagement: React.FC<UserManagementProps> = (props) => {
  return <AdminPanel {...props} />;
};

export default UserManagement;
