import React from 'react';
import AdminPanelV2 from './AdminPanelV2';

interface UserManagementProps {
  isOnline: boolean;
  onMessageUpdate: () => void;
  onlineCount: number;
}

/** Centralized administration entry point. */
const UserManagement: React.FC<UserManagementProps> = (props) => <div className="user-management-workstation"><AdminPanelV2 {...props} /></div>;

export default UserManagement;
