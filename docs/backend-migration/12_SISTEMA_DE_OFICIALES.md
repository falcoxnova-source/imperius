# Sistema de Oficiales - Documentacion de Migracion Backend

## Descripcion General

Los oficiales son mejoras premium que proporcionan bonificaciones significativas a diferentes aspectos del juego. Se compran por tiempo limitado usando FXU o Materia Oscura, y sus efectos se aplican automaticamente mientras esten activos.

---

## Tipos de Oficiales

### Comandante

| Aspecto | Valor |
|---------|-------|
| Bonus | +3 slots de cola de construccion (total 5) |
| Uso | Permite encolar mas edificios simultaneamente |

### Almirante

| Aspecto | Valor |
|---------|-------|
| Bonus | +2 slots de flota adicionales |
| Uso | Permite mas flotas simultaneas en vuelo |

### Ingeniero

| Aspecto | Valor |
|---------|-------|
| Bonus | +10% produccion de energia |
| Bonus | +50% reconstruccion de defensas |
| Uso | Mejora energia y supervivencia de defensas |

### Geologo

| Aspecto | Valor |
|---------|-------|
| Bonus | +10% produccion de minas |
| Uso | Aumenta metal, cristal y deuterio |

### Tecnocrata

| Aspecto | Valor |
|---------|-------|
| Bonus | -25% tiempo de investigacion |
| Bonus | +2 niveles efectivos de espionaje |
| Uso | Investiga mas rapido y obtiene mejor informacion |

---

## Duraciones Disponibles

| Duracion | Dias | Descripcion |
|----------|------|-------------|
| weekly | 7 | Una semana |
| monthly | 30 | Un mes |
| quarterly | 90 | Tres meses |

---

## Sistema de Precios

### Precios en Materia Oscura

| Oficial | 7 dias | 30 dias | 90 dias |
|---------|--------|---------|---------|
| Comandante | 1000 | 3500 | 9000 |
| Almirante | 1000 | 3500 | 9000 |
| Ingeniero | 1000 | 3500 | 9000 |
| Geologo | 1000 | 3500 | 9000 |
| Tecnocrata | 1000 | 3500 | 9000 |

### Precios en FXU

Los precios en FXU son configurables por el administrador:

```
precio_fxu = obtener_precio_configurado(oficial, duracion)
```

---

## Proceso de Compra

### Funcion: purchase_officer

**Paso 1: Validaciones**
```
1. Verificar tipo de oficial valido
2. Verificar duracion valida
3. Verificar oficial no esta activo actualmente
4. Verificar balance suficiente (FXU o Materia Oscura)
```

**Paso 2: Determinar Precio**
```
Si metodo_pago == 'fxu':
    precio = obtener_precio_fxu(oficial, duracion)
Si metodo_pago == 'dark_matter':
    precio = obtener_precio_dm(oficial, duracion)
```

**Paso 3: Descontar Pago**
```sql
Si metodo_pago == 'fxu':
    UPDATE profiles
    SET fxu_balance = fxu_balance - precio
    WHERE id = auth.uid();

    -- Registrar ingreso
    INSERT INTO admin_revenue (type, amount, ...)
    VALUES ('officer_fxu', precio, ...);

Si metodo_pago == 'dark_matter':
    UPDATE profiles
    SET dark_matter = dark_matter - precio
    WHERE id = auth.uid();
```

**Paso 4: Activar Oficial**
```sql
INSERT INTO user_officers (
  user_id, officer_type_id, expires_at
) VALUES (
  auth.uid(), p_officer_type,
  now() + interval '1 day' * dias_duracion
);
```

---

## Verificacion de Oficial Activo

### Funcion: get_active_officers

```sql
SELECT officer_type_id, expires_at
FROM user_officers
WHERE user_id = auth.uid()
  AND expires_at > now();
```

### En Logica del Juego

```
oficiales_activos = obtener_oficiales_activos(user_id)

Si 'commander' en oficiales_activos:
    slots_cola = 5
Si no:
    slots_cola = 2

Si 'admiral' en oficiales_activos:
    slots_flota = slots_base + 2

Si 'engineer' en oficiales_activos:
    energia_total = energia_calculada * 1.10
    reconstruccion_defensas = 0.85

Si 'geologist' en oficiales_activos:
    produccion_metal *= 1.10
    produccion_cristal *= 1.10
    produccion_deuterio *= 1.10

Si 'technocrat' en oficiales_activos:
    tiempo_investigacion *= 0.75
    nivel_espionaje_efectivo += 2
```

---

## Aplicacion de Bonus en Backend

### En Calculo de Recursos

```
funcion calculate_and_sync_resources(planet_id):
    ...
    // Verificar Geologo
    geologo_activo = existe_oficial_activo(user_id, 'geologist')

    Si geologo_activo:
        prod_metal *= 1.10
        prod_cristal *= 1.10
        prod_deuterio *= 1.10
    ...
```

### En Calculo de Energia

```
funcion calcular_energia(planet_id):
    ...
    // Verificar Ingeniero
    ingeniero_activo = existe_oficial_activo(user_id, 'engineer')

    Si ingeniero_activo:
        energia_total *= 1.10
    ...
```

### En Cola de Edificios

```
funcion secure_add_to_building_queue(planet_id, building_id):
    ...
    // Verificar Comandante
    comandante_activo = existe_oficial_activo(user_id, 'commander')

    Si comandante_activo:
        max_slots = 5
    Si no:
        max_slots = 2

    Si items_en_cola >= max_slots:
        ERROR: "Cola de construccion llena"
    ...
```

### En Slots de Flota

```
funcion secure_send_fleet(...):
    ...
    // Verificar Almirante
    almirante_activo = existe_oficial_activo(user_id, 'admiral')

    slots_base = 1 + nivel_computacion
    Si almirante_activo:
        slots_totales = slots_base + 2
    Si no:
        slots_totales = slots_base

    Si flotas_activas >= slots_totales:
        ERROR: "No hay slots de flota disponibles"
    ...
```

### En Tiempo de Investigacion

```
funcion secure_start_research(planet_id, tech_id):
    ...
    // Verificar Tecnocrata
    tecnocrata_activo = existe_oficial_activo(user_id, 'technocrat')

    Si tecnocrata_activo:
        tiempo_investigacion *= 0.75
    ...
```

### En Reconstruccion de Defensas

```
funcion procesar_combate(...):
    ...
    // Verificar Ingeniero del defensor
    ingeniero_activo = existe_oficial_activo(defensor_id, 'engineer')

    Si ingeniero_activo:
        prob_reconstruccion = 0.85
    Si no:
        prob_reconstruccion = 0.70

    Para cada defensa destruida:
        Si random() < prob_reconstruccion:
            reconstruir defensa
    ...
```

### En Espionaje

```
funcion procesar_espionaje(...):
    ...
    // Verificar Tecnocrata del atacante
    tecnocrata_activo = existe_oficial_activo(atacante_id, 'technocrat')

    nivel_espionaje = nivel_tech_espionaje
    Si tecnocrata_activo:
        nivel_espionaje += 2

    diferencia = nivel_espionaje - nivel_espionaje_defensor
    // Determinar informacion visible segun diferencia
    ...
```

---

## Bloqueo de Recompra

### Regla

No se puede comprar un oficial mientras esta activo:

```
Si oficial_actual.expires_at > now():
    ERROR: "Este oficial ya esta activo hasta {fecha}"
```

### Justificacion

Evita acumulacion de tiempo y mantiene balance del juego.

---

## Expiracion de Oficiales

### Proceso Automatico

Los oficiales expiran automaticamente:

```
Si now() > oficial.expires_at:
    oficial ya no aplica bonus
```

No se necesita proceso de limpieza - simplemente no aparecen en consultas activas.

---

## Tabla: user_officers

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| user_id | UUID | Usuario |
| officer_type_id | TEXT | Tipo de oficial |
| expires_at | TIMESTAMP | Fecha de expiracion |
| created_at | TIMESTAMP | Fecha de compra |
| payment_method | TEXT | 'fxu' o 'dark_matter' |
| amount_paid | NUMERIC | Cantidad pagada |

---

## Tabla: officer_types

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | TEXT | ID del oficial |
| name | TEXT | Nombre |
| description | TEXT | Descripcion del bonus |
| image_url | TEXT | Imagen del oficial |

---

## Tabla: officer_pricing (Admin)

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| officer_type_id | TEXT | Tipo de oficial |
| duration | TEXT | 'weekly', 'monthly', 'quarterly' |
| price_dark_matter | INTEGER | Precio en Materia Oscura |
| price_fxu | NUMERIC | Precio en FXU |
| is_available | BOOLEAN | Si esta disponible para compra |

---

## Funcion Helper: has_active_officer

```sql
CREATE FUNCTION has_active_officer(p_user_id UUID, p_officer_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_officers
    WHERE user_id = p_user_id
      AND officer_type_id = p_officer_type
      AND expires_at > now()
  );
END;
$$ LANGUAGE plpgsql;
```

---

## Consideraciones de Seguridad

### RLS para user_officers

```sql
CREATE POLICY "Users can view own officers"
  ON user_officers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

### Validaciones Criticas

1. **Verificar balance antes de compra** siempre en backend
2. **Verificar oficial no activo** antes de permitir compra
3. **Registrar todas las transacciones** para auditoria
4. **Calcular precios en backend** no confiar en cliente
5. **Verificar oficiales en cada operacion** que los use
