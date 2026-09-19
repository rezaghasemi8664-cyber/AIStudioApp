IF OBJECT_ID(N'dbo.UserPermission', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[UserPermission] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [userId] INT NOT NULL,
        [permissionId] INT NOT NULL,
        CONSTRAINT [UserPermission_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UserPermission_userId_permissionId_key] UNIQUE ([userId], [permissionId]),
        CONSTRAINT [UserPermission_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE,
        CONSTRAINT [UserPermission_permissionId_fkey] FOREIGN KEY ([permissionId]) REFERENCES [dbo].[Permission]([id]) ON DELETE CASCADE
    );

    CREATE INDEX [UserPermission_userId_idx] ON [dbo].[UserPermission]([userId]);
END
