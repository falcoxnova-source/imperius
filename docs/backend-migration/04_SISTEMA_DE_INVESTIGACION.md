# Sistema de Investigacion y Tecnologias - Documentacion de Migracion Backend

## Descripcion General

El sistema de investigacion permite a los jugadores desarrollar tecnologias que mejoran sus capacidades de produccion, combate y expansion. Las investigaciones se realizan en el Laboratorio de Investigacion y afectan a todo el imperio del jugador (no solo al planeta donde se investiga).

---

## Categorias de Tecnologias

### Tecnologias Basicas

| ID | Nombre | Funcion |
|----|--------|---------|
| espionage_tech | Tecnologia de Espionaje | Mejora informacion de espionaje |
| computer_tech | Tecnologia de Computacion | Mas slots de flota |
| weapons_tech | Tecnologia de Armas | +10% dano por nivel |
| shielding_tech | Tecnologia de Escudos | +10% escudos por nivel |
| armour_tech | Tecnologia de Blindaje | +10% puntos de casco por nivel |
| energy_tech | Tecnologia de Energia | Mejora reactor fusion |

### Tecnologias de Propulsion

| ID | Nombre | Funcion |
|----|--------|---------|
| combustion_drive | Motor de Combustion | +10% velocidad naves basicas |
| impulse_drive | Motor de Impulso | +20% velocidad naves medias |
| hyperspace_drive | Motor de Hiperimpulsor | +30% velocidad naves avanzadas |

### Tecnologias Avanzadas

| ID | Nombre | Funcion |
|----|--------|---------|
| hyperspace_tech | Tecnologia Hiperespacio | Desbloquea naves avanzadas |
| laser_tech | Tecnologia Laser | Desbloquea defensas laser |
| ion_tech | Tecnologia Ionica | Desbloquea defensas ionicas |
| plasma_tech | Tecnologia de Plasma | Desbloquea torreta plasma |
| irn_tech | Red Intergalactica | Conecta laboratorios de colonias |
| graviton_tech | Tecnologia Graviton | Desbloquea Estrella de la Muerte |
| astrophysics | Astrofisica | Mas colonias y expediciones |

---

## Formulas de Costos

### Formula General

```
costo_nivel = costo_base * (factor_costo)^(nivel_actual)
```

**Factor de costo investigacion:** 2.0

### Costos Base por Tecnologia

| Tecnologia | Metal Base | Cristal Base | Deuterio Base |
|------------|------------|--------------|---------------|
| Espionaje | 200 | 1000 | 200 |
| Computacion | 0 | 400 | 600 |
| Armas | 800 | 200 | 0 |
| Escudos | 200 | 600 | 0 |
| Blindaje | 1000 | 0 | 0 |
| Energia | 0 | 800 | 400 |
| Combustion | 400 | 0 | 600 |
| Impulso | 2000 | 4000 | 600 |
| Hiperimpulsor | 10000 | 20000 | 6000 |
| Hiperespacio | 0 | 4000 | 2000 |
| Laser | 200 | 100 | 0 |
| Ionica | 1000 | 300 | 100 |
| Plasma | 2000 | 4000 | 1000 |
| IRN | 240000 | 400000 | 160000 |
| Graviton | 0 | 0 | 0 |
| Astrofisica | 4000 | 8000 | 4000 |

### Ejemplo de Calculo

**Tecnologia de Armas nivel 5:**
```
metal = 800 * (2.0)^4 = 800 * 16 = 12,800
cristal = 200 * (2.0)^4 = 200 * 16 = 3,200
deuterio = 0
```

---

## Tecnologia Graviton - Caso Especial

### Requisito de Energia

La tecnologia Graviton no tiene costo de recursos, pero requiere una cantidad masiva de energia:

```
energia_requerida = 300000
```

### Calculo de Energia Total del Imperio

```
Para cada planeta del jugador:
    energia += energia_planta_solar
    energia += energia_reactor_fusion
    energia += satelites * energia_por_satelite

Si energia_total >= 300000:
    Puede investigar Graviton
```

---

## Formula de Tiempo de Investigacion

### Formula General

```
tiempo_segundos = ((costo_metal + costo_cristal) / (1000 * (1 + nivel_lab_efectivo))) * 3600 / velocidad_juego
```

### Red Intergalactica (IRN)

El nivel efectivo del laboratorio se calcula considerando los laboratorios de las colonias:

```
nivel_lab_efectivo = nivel_lab_principal + suma_labs_colonias

Donde suma_labs_colonias = suma de los (nivel_irn) laboratorios mas altos de las colonias
```

**Ejemplo:**
- Lab principal: nivel 10
- IRN: nivel 3
- Labs colonias: [8, 7, 6, 5, 4]

```
nivel_efectivo = 10 + 8 + 7 + 6 = 31
(Se suman los 3 mejores labs de colonias porque IRN = 3)
```

### Con Bonus de Tecnocrata (oficial)

```
tiempo_final = tiempo_base * 0.75
```

---

## Sistema de Requisitos

### Tabla de Requisitos

| Tecnologia | Requisitos |
|------------|------------|
| Espionaje | Laboratorio 3 |
| Computacion | Laboratorio 1 |
| Armas | Laboratorio 4 |
| Escudos | Laboratorio 6, Energia 3 |
| Blindaje | Laboratorio 2 |
| Energia | Laboratorio 1 |
| Combustion | Laboratorio 1, Energia 1 |
| Impulso | Laboratorio 2, Energia 1 |
| Hiperimpulsor | Laboratorio 7, Hiperespacio 3 |
| Hiperespacio | Laboratorio 7, Escudos 5, Energia 5 |
| Laser | Laboratorio 1, Energia 2 |
| Ionica | Laboratorio 4, Laser 5, Energia 4 |
| Plasma | Laboratorio 4, Energia 8, Laser 10, Ionica 5 |
| IRN | Laboratorio 10, Computacion 8, Hiperespacio 8 |
| Graviton | Laboratorio 12 |
| Astrofisica | Laboratorio 3, Espionaje 4, Impulso 3 |

---

## Proceso de Investigacion

### Restricciones Importantes

1. **Solo una investigacion activa** por jugador en todo el universo
2. La investigacion se inicia desde un planeta con laboratorio
3. El nivel del laboratorio afecta el tiempo
4. IRN suma laboratorios de colonias

### Paso 1: Validacion

```
1. Verificar usuario no tiene investigacion activa
2. Verificar planeta tiene laboratorio
3. Verificar requisitos de la tecnologia
4. Verificar recursos suficientes
5. Si es Graviton, verificar energia total del imperio
```

### Paso 2: Calcular Tiempo

```
1. Obtener nivel de laboratorio del planeta
2. Calcular nivel efectivo con IRN
3. Aplicar formula de tiempo
4. Si Tecnocrata activo, aplicar bonus 25%
```

### Paso 3: Iniciar Investigacion

```sql
-- Marcar investigacion activa en perfil
UPDATE profiles
SET
  active_research_id = p_tech_id,
  research_end_time = now() + intervalo_tiempo,
  research_planet_id = p_planet_id
WHERE id = auth.uid();

-- Descontar recursos del planeta
UPDATE planet_resources
SET
  metal = metal - costo_metal,
  crystal = crystal - costo_cristal,
  deuterium = deuterium - costo_deuterio
WHERE planet_id = p_planet_id;
```

### Paso 4: Completar Investigacion

**Funcion: complete_research**

```
1. Verificar research_end_time <= now()
2. Incrementar nivel de tecnologia en user_technologies
3. Limpiar campos de investigacion en profiles
4. Actualizar puntos del usuario
5. Enviar notificacion al jugador
```

---

## Tabla: user_technologies

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| user_id | UUID | ID del jugador |
| technology_type_id | TEXT | ID de la tecnologia |
| level | INTEGER | Nivel actual |
| updated_at | TIMESTAMP | Ultima actualizacion |

---

## Efectos de las Tecnologias

### Tecnologia de Espionaje

```
informacion_espionaje = nivel_espionaje_atacante - nivel_espionaje_defensor

Si diferencia >= 2: Ver recursos
Si diferencia >= 4: Ver flotas
Si diferencia >= 6: Ver defensas
Si diferencia >= 8: Ver edificios
Si diferencia >= 10: Ver tecnologias
```

### Tecnologia de Computacion

```
slots_flota = 1 + nivel_computacion
```

### Tecnologias de Combate

```
dano_total = dano_base * (1 + nivel_armas * 0.10)
escudo_total = escudo_base * (1 + nivel_escudos * 0.10)
casco_total = casco_base * (1 + nivel_blindaje * 0.10)
```

### Tecnologias de Propulsion

**Combustion (naves basicas):**
```
velocidad = velocidad_base * (1 + nivel_combustion * 0.10)
```

**Impulso (naves medias):**
```
velocidad = velocidad_base * (1 + nivel_impulso * 0.20)
```

**Hiperimpulsor (naves avanzadas):**
```
velocidad = velocidad_base * (1 + nivel_hiperimpulsor * 0.30)
```

### Tecnologia de Energia

```
produccion_fusion = 30 * nivel * (1.05 + nivel_energia * 0.01)^nivel
```

### Astrofisica

```
max_colonias = floor((nivel_astrofisica + 1) / 2)
slots_expedicion = floor(sqrt(nivel_astrofisica))
duracion_max_expedicion = min(20, 1 + floor(nivel_astrofisica / 3))
```

### Red Intergalactica (IRN)

```
labs_adicionales = nivel_irn
nivel_lab_efectivo = lab_principal + suma(top_N_labs_colonias)
donde N = nivel_irn
```

---

## Bonus de Tecnocrata

El oficial Tecnocrata proporciona:
- -25% tiempo de investigacion
- +2 niveles efectivos de espionaje

```
Si tecnocrata_activo:
    tiempo_investigacion = tiempo_base * 0.75
    nivel_espionaje_efectivo = nivel_espionaje + 2
```

---

## Funcion RPC: secure_start_research

### Parametros

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| p_planet_id | UUID | Planeta con laboratorio |
| p_tech_type_id | TEXT | ID de la tecnologia |

### Logica Completa

```
1. Verificar usuario autenticado
2. Verificar planeta pertenece al usuario
3. Verificar no hay investigacion activa
4. Verificar planeta tiene laboratorio nivel >= 1
5. Obtener nivel actual de la tecnologia
6. Verificar requisitos
7. Si Graviton, verificar energia del imperio
8. Calcular costo del siguiente nivel
9. Sincronizar y verificar recursos
10. Descontar recursos
11. Calcular tiempo con IRN y Tecnocrata
12. Actualizar profiles con investigacion activa
13. Retornar datos de investigacion
```

### Retorno

```json
{
  "success": true,
  "technology_type_id": "weapons_tech",
  "level": 6,
  "start_time": "2024-01-01T10:00:00Z",
  "end_time": "2024-01-01T12:30:00Z",
  "cost_metal": 25600,
  "cost_crystal": 6400,
  "cost_deuterium": 0,
  "effective_lab_level": 15
}
```

---

## Completar con FXU (Instantaneo)

### Formula de Costo FXU

```
costo_recursos = costo_metal + costo_cristal + costo_deuterio
costo_fxu = (costo_recursos / ratio_fxu_investigacion) * factor_tiempo_restante
```

**Ratio por defecto:** 3000 (mas barato que edificios)

### Proceso

```
1. Verificar investigacion activa
2. Calcular costo FXU basado en tiempo restante
3. Verificar balance FXU
4. Descontar FXU
5. Completar investigacion inmediatamente
6. Actualizar puntos
7. Registrar transaccion
8. Contribuir al jackpot
```

---

## Consideraciones de Seguridad

### RLS para user_technologies

```sql
CREATE POLICY "Users can view own technologies"
  ON user_technologies FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

### Validaciones Criticas

1. **Solo una investigacion activa** - Verificar siempre
2. **Validar requisitos en backend** - Nunca confiar en cliente
3. **Verificar propiedad del planeta** - Siempre
4. **Verificar laboratorio existe** - Nivel >= 1
5. **Graviton requiere energia total** - Calcular de todos los planetas

---

## Tabla de Tiempos de Referencia

### Con Laboratorio nivel 10, IRN 0, velocidad x1

| Tecnologia | Nivel 1 | Nivel 5 | Nivel 10 |
|------------|---------|---------|----------|
| Espionaje | 6.5 min | 1.7 h | 27 h |
| Computacion | 5.5 min | 1.4 h | 23 h |
| Armas | 5.5 min | 1.4 h | 23 h |
| Escudos | 4.4 min | 1.1 h | 18 h |
| Blindaje | 5.5 min | 1.4 h | 23 h |
| Energia | 6.5 min | 1.7 h | 27 h |
| Combustion | 5.5 min | 1.4 h | 23 h |
| Impulso | 33 min | 8.7 h | 139 h |
| Hiperimpulsor | 2.7 h | 44 h | 704 h |
| Astrofisica | 1.1 h | 17 h | 279 h |

**Nota:** Con IRN y Tecnocrata estos tiempos se reducen significativamente.
