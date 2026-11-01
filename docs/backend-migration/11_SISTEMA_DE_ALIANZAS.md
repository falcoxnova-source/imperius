# Sistema de Alianzas - Documentacion de Migracion Backend

## Descripcion General

El sistema de alianzas permite a los jugadores unirse en grupos para cooperar, compartir recursos mediante transportes, y realizar ataques coordinados (ACS). Las alianzas tienen una estructura de rangos con diferentes permisos y pueden declarar guerras entre ellas.

---

## Estructura de una Alianza

### Tabla: alliances

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| name | TEXT | Nombre de la alianza |
| tag | TEXT | Tag corto (3-8 caracteres) |
| founder_id | UUID | Fundador |
| leader_id | UUID | Lider actual |
| description | TEXT | Descripcion publica |
| internal_text | TEXT | Texto solo para miembros |
| application_text | TEXT | Texto para solicitantes |
| logo_url | TEXT | URL del logo |
| is_open | BOOLEAN | Si acepta miembros directamente |
| member_count | INTEGER | Cantidad de miembros |
| total_points | BIGINT | Puntos totales |
| created_at | TIMESTAMP | Fecha de creacion |

---

## Sistema de Rangos

### Rangos Predefinidos

| Rango | Permisos |
|-------|----------|
| Lider | Todos los permisos |
| Oficial | Invitar, expulsar miembros basicos |
| Miembro | Sin permisos especiales |

### Permisos Disponibles

| Permiso | Descripcion |
|---------|-------------|
| can_invite | Puede invitar nuevos miembros |
| can_kick | Puede expulsar miembros |
| can_edit | Puede editar descripcion/logo |
| can_manage_wars | Puede declarar/aceptar guerras |
| can_manage_ranks | Puede cambiar rangos de miembros |
| can_dissolve | Puede disolver la alianza |

---

## Proceso de Crear Alianza

### Funcion: create_alliance

**Paso 1: Validaciones**
```
1. Verificar usuario no esta en otra alianza
2. Verificar nombre no existe
3. Verificar tag no existe
4. Verificar tag tiene 3-8 caracteres
5. Verificar nombre tiene 3-30 caracteres
```

**Paso 2: Crear Alianza**
```sql
INSERT INTO alliances (
  name, tag, founder_id, leader_id,
  is_open, member_count
) VALUES (
  p_name, p_tag, auth.uid(), auth.uid(),
  false, 1
);
```

**Paso 3: Agregar Fundador como Miembro**
```sql
INSERT INTO alliance_members (
  alliance_id, user_id, rank, joined_at
) VALUES (
  new_alliance_id, auth.uid(), 'leader', now()
);
```

**Paso 4: Actualizar Perfil**
```sql
UPDATE profiles
SET alliance_id = new_alliance_id
WHERE id = auth.uid();
```

---

## Sistema de Aplicaciones

### Proceso de Solicitud

**Paso 1: Crear Aplicacion**
```sql
INSERT INTO alliance_applications (
  alliance_id, user_id, message, status
) VALUES (
  p_alliance_id, auth.uid(), p_message, 'pending'
);
```

**Paso 2: Notificar a Oficiales**
```
Enviar mensaje a todos los miembros con permiso can_invite
```

### Aceptar Aplicacion

**Funcion: accept_alliance_application**

```
1. Verificar usuario tiene permiso can_invite
2. Verificar aplicacion existe y esta pendiente
3. Verificar solicitante no esta en otra alianza
4. Verificar alianza no esta llena

Si todo OK:
    Agregar solicitante como miembro
    Actualizar perfil del solicitante
    Eliminar aplicacion
    Incrementar member_count
    Notificar al solicitante
```

### Rechazar Aplicacion

```sql
UPDATE alliance_applications
SET status = 'rejected'
WHERE id = application_id;

-- Notificar al solicitante
```

---

## Unirse Directamente (Alianza Abierta)

### Funcion: join_alliance

**Validaciones:**
```
1. Verificar alianza es abierta (is_open = true)
2. Verificar usuario no esta en otra alianza
3. Verificar alianza no esta llena
```

**Proceso:**
```sql
INSERT INTO alliance_members (
  alliance_id, user_id, rank, joined_at
) VALUES (
  p_alliance_id, auth.uid(), 'member', now()
);

UPDATE profiles
SET alliance_id = p_alliance_id
WHERE id = auth.uid();

UPDATE alliances
SET member_count = member_count + 1
WHERE id = p_alliance_id;
```

---

## Abandonar Alianza

### Funcion: leave_alliance

**Validaciones:**
```
Si usuario es lider:
    Si hay otros miembros:
        ERROR: "Debes transferir liderazgo antes de salir"
    Si no:
        Disolver alianza automaticamente
```

**Proceso:**
```sql
DELETE FROM alliance_members
WHERE alliance_id = p_alliance_id AND user_id = auth.uid();

UPDATE profiles
SET alliance_id = NULL
WHERE id = auth.uid();

UPDATE alliances
SET member_count = member_count - 1
WHERE id = p_alliance_id;
```

---

## Expulsar Miembro

### Funcion: kick_alliance_member

**Validaciones:**
```
1. Verificar usuario tiene permiso can_kick
2. Verificar objetivo es miembro de la alianza
3. Verificar objetivo no es el lider
4. Verificar objetivo tiene rango menor o igual
```

**Proceso:**
```sql
DELETE FROM alliance_members
WHERE alliance_id = p_alliance_id AND user_id = p_target_id;

UPDATE profiles
SET alliance_id = NULL
WHERE id = p_target_id;

UPDATE alliances
SET member_count = member_count - 1
WHERE id = p_alliance_id;

-- Notificar al expulsado
```

---

## Transferir Liderazgo

### Funcion: transfer_leadership

**Validaciones:**
```
1. Verificar usuario es el lider actual
2. Verificar nuevo lider es miembro
```

**Proceso:**
```sql
-- Cambiar rango del lider actual
UPDATE alliance_members
SET rank = 'officer'
WHERE alliance_id = p_alliance_id AND user_id = auth.uid();

-- Promover nuevo lider
UPDATE alliance_members
SET rank = 'leader'
WHERE alliance_id = p_alliance_id AND user_id = p_new_leader_id;

-- Actualizar alianza
UPDATE alliances
SET leader_id = p_new_leader_id
WHERE id = p_alliance_id;
```

---

## Disolver Alianza

### Funcion: dissolve_alliance

**Validaciones:**
```
1. Verificar usuario es el lider
2. Verificar alianza no tiene guerras activas
```

**Proceso:**
```sql
-- Limpiar perfiles de todos los miembros
UPDATE profiles
SET alliance_id = NULL
WHERE alliance_id = p_alliance_id;

-- Eliminar miembros
DELETE FROM alliance_members
WHERE alliance_id = p_alliance_id;

-- Eliminar aplicaciones pendientes
DELETE FROM alliance_applications
WHERE alliance_id = p_alliance_id;

-- Eliminar alianza
DELETE FROM alliances
WHERE id = p_alliance_id;
```

---

## Sistema de Guerras

### Declarar Guerra

**Funcion: declare_war**

```
1. Verificar usuario tiene permiso can_manage_wars
2. Verificar alianza objetivo existe
3. Verificar no hay guerra activa entre las alianzas
4. Crear registro de guerra con status 'pending'
5. Notificar a alianza objetivo
```

### Aceptar Guerra

```
1. Verificar usuario de alianza objetivo tiene permiso
2. Cambiar status a 'active'
3. Notificar a ambas alianzas
```

### Efectos de Guerra

Durante una guerra activa:
- Los miembros pueden atacarse sin proteccion noob
- No aplica limite de bashing
- Los ataques dan puntos de guerra
- La alianza con mas puntos al finalizar gana

### Finalizar Guerra

```
1. Calcular puntos de guerra de cada lado
2. Determinar ganador
3. Cambiar status a 'ended'
4. Registrar resultado
5. Notificar a ambas alianzas
```

---

## Restriccion de Transporte

### Regla

Solo se pueden enviar transportes a miembros de la misma alianza:

```
Si mision == 'transport':
    Si destino_usuario.alliance_id != origen_usuario.alliance_id:
        ERROR: "Solo puedes transportar a miembros de tu alianza"
```

---

## Sistema ACS (Ataque Coordinado)

### Slots ACS

```
slots_acs = min(5, 1 + floor(nivel_deposito_alianza / 2))
```

El Deposito de Alianza en el planeta determina cuantas flotas aliadas pueden unirse.

### Crear Ataque ACS

**Paso 1:** Primera flota ataca normalmente
**Paso 2:** Otras flotas de la alianza pueden unirse con mision 'hold'
**Paso 3:** Todas las flotas se combinan al llegar

### Tiempo de Espera

```
tiempo_espera = tiempo_vuelo_mas_largo * 0.30
```

Las flotas mas rapidas esperan a las mas lentas.

---

## Calculo de Puntos de Alianza

### Formula

```
puntos_alianza = suma(puntos_miembro para cada miembro)
```

### Actualizacion

Los puntos se recalculan cuando:
- Un miembro gana/pierde puntos
- Un miembro se une/sale de la alianza

```sql
UPDATE alliances
SET total_points = (
  SELECT COALESCE(SUM(p.total_points), 0)
  FROM alliance_members am
  JOIN profiles p ON p.id = am.user_id
  WHERE am.alliance_id = alliances.id
)
WHERE id = p_alliance_id;
```

---

## Limite de Miembros

### Configuracion

```
max_miembros_alianza = obtener_de_configuracion() // default 50
```

### Validacion

```
Si member_count >= max_miembros:
    ERROR: "La alianza ha alcanzado el limite de miembros"
```

---

## Tabla: alliance_members

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| alliance_id | UUID | Alianza |
| user_id | UUID | Usuario |
| rank | TEXT | Rango del miembro |
| joined_at | TIMESTAMP | Fecha de union |

---

## Tabla: alliance_applications

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| alliance_id | UUID | Alianza |
| user_id | UUID | Solicitante |
| message | TEXT | Mensaje de solicitud |
| status | TEXT | 'pending', 'accepted', 'rejected' |
| created_at | TIMESTAMP | Fecha de solicitud |

---

## Tabla: alliance_wars

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| attacker_alliance_id | UUID | Alianza atacante |
| defender_alliance_id | UUID | Alianza defensora |
| status | TEXT | 'pending', 'active', 'ended' |
| attacker_points | INTEGER | Puntos del atacante |
| defender_points | INTEGER | Puntos del defensor |
| winner_id | UUID | Alianza ganadora |
| started_at | TIMESTAMP | Inicio |
| ended_at | TIMESTAMP | Fin |

---

## Consideraciones de Seguridad

### RLS para alliances

```sql
-- Todos pueden ver alianzas
CREATE POLICY "Anyone can view alliances"
  ON alliances FOR SELECT
  TO authenticated
  USING (true);

-- Solo el lider puede editar
CREATE POLICY "Leader can update alliance"
  ON alliances FOR UPDATE
  TO authenticated
  USING (leader_id = auth.uid())
  WITH CHECK (leader_id = auth.uid());
```

### RLS para alliance_members

```sql
-- Todos pueden ver miembros
CREATE POLICY "Anyone can view members"
  ON alliance_members FOR SELECT
  TO authenticated
  USING (true);
```

### Validaciones Criticas

1. **Verificar permisos** antes de cada accion
2. **Verificar membresia** siempre
3. **Usar transacciones** para operaciones multiples
4. **Sincronizar member_count** correctamente
5. **Limpiar al disolver** todos los datos relacionados
