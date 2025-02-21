-- CreateTable
CREATE TABLE "Usuario" (
    "IDUsuario" SERIAL NOT NULL,
    "NombreUsuario" TEXT NOT NULL,
    "PrimerNombre" TEXT NOT NULL,
    "Apellido" TEXT NOT NULL,
    "CorreoElectronico" TEXT NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("IDUsuario")
);

-- CreateTable
CREATE TABLE "Rol" (
    "IDRol" SERIAL NOT NULL,
    "NombreRol" TEXT NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("IDRol")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "IDCliente" SERIAL NOT NULL,
    "NombreCliente" TEXT NOT NULL,
    "PersonaContacto" TEXT NOT NULL,
    "CorreoElectronico" TEXT NOT NULL,
    "Telefono" TEXT NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("IDCliente")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "IDTicket" SERIAL NOT NULL,
    "Titulo" TEXT NOT NULL,
    "Descripcion" TEXT NOT NULL,
    "Estado" TEXT NOT NULL,
    "Prioridad" TEXT NOT NULL,
    "IDUsuarioAsignado" INTEGER,
    "IDCliente" INTEGER NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("IDTicket")
);

-- CreateTable
CREATE TABLE "_UsuarioRoles" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_NombreUsuario_key" ON "Usuario"("NombreUsuario");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_CorreoElectronico_key" ON "Usuario"("CorreoElectronico");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_NombreRol_key" ON "Rol"("NombreRol");

-- CreateIndex
CREATE UNIQUE INDEX "_UsuarioRoles_AB_unique" ON "_UsuarioRoles"("A", "B");

-- CreateIndex
CREATE INDEX "_UsuarioRoles_B_index" ON "_UsuarioRoles"("B");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_IDUsuarioAsignado_fkey" FOREIGN KEY ("IDUsuarioAsignado") REFERENCES "Usuario"("IDUsuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_IDCliente_fkey" FOREIGN KEY ("IDCliente") REFERENCES "Cliente"("IDCliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UsuarioRoles" ADD CONSTRAINT "_UsuarioRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "Rol"("IDRol") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UsuarioRoles" ADD CONSTRAINT "_UsuarioRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "Usuario"("IDUsuario") ON DELETE CASCADE ON UPDATE CASCADE;
