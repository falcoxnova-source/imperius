/*
  Imperium: la seguridad por filas (RLS) estaba desactivada en storage.objects,
  por lo que las politicas de avatars / kyc-documents / p2p-evidence no se
  aplicaban (cualquier usuario autenticado podia leer documentos KYC ajenos).
  Las politicas ya existian; solo se activa RLS.

  Nota: en el mismo cambio se agrego en /opt/imperium/kong.yml el servicio
  "storage-v1-public" (GET /storage/v1/object/public/* sin API key) para que
  los avatares se puedan mostrar en <img>.
*/
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
