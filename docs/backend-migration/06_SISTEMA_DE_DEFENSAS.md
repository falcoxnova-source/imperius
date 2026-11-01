# Sistema de Defensas - Documentacion de Migracion Backend

## Descripcion General

El sistema de defensas permite a los jugadores proteger sus planetas contra ataques enemigos. A diferencia de las naves, las defensas son estacionarias y no pueden moverse. Tienen la caracteristica unica de poder reconstruirse parcialmente despues de un combate.

---

## Tipos de Defensas

### Defensas Basicas

| ID | Nombre | Funcion |
|----|--------|---------|
| rocket_launcher | Lanzamisiles | Defensa barata, basica |
| light_laser | Laser Ligero | Anti-cazas |
| heavy_laser | Laser Pesado | Defensa media |

### Defensas Avanzadas

| ID | Nombre | Funcion |
|----|--------|---------|
| gauss_cannon | Canon Gauss | Alto dano |
| ion_cannon | Canon Ionico | Dano a escudos |
| plasma_turret | Torreta de Plasma | Muy alto dano |

### Defensas Especiales

| ID | Nombre | Funcion |
|----|--------|---------|
| small_shield_dome | Cupula Pequena de Escudo | Escudo planetario basico |
| large_shield_dome | Cupula Grande de Escudo | Escudo planetario avanzado |
| anti_ballistic_missile | Misil Antibalistico | Intercepta misiles interplanetarios |
| interplanetary_missile | Misil Interplanetario | Ataca defensas enemigas |

---

## Especificaciones de Defensas

### Costos y Estadisticas

| Defensa | Metal | Cristal | Deuterio | Casco | Escudo | Armas |
|---------|-------|---------|----------|-------|--------|-------|
| Lanzamisiles | 2000 | 0 | 0 | 2000 | 20 | 80 |
| Laser Ligero | 1500 | 500 | 0 | 2000 | 25 | 100 |
| Laser Pesado | 6000 | 2000 | 0 | 8000 | 100 | 250 |
| Canon Gauss | 20000 | 15000 | 2000 | 35000 | 200 | 1100 |
| Canon Ionico | 5000 | 3000 | 0 | 8000 | 500 | 150 |
| Torreta Plasma | 50000 | 50000 | 30000 | 100000 | 300 | 3000 |
| Cupula Pequena | 10000 | 10000 | 0 | 20000 | 2000 | 1 |
| Cupula Grande | 50000 | 50000 | 0 | 100000 | 10000 | 1 |
| Misil Antibalistico | 8000 | 0 | 2000 | - | - | - |
| Misil Interplanetario | 12500 | 2500 | 10000 | - | - | - |

---

## Limites de Construccion

### Cupulas de Escudo

Las cupulas de escudo tienen un limite de **1 por planeta**:

```
max_cupula_pequena = 1
max_cupula_grande = 1
```

### Misiles

Los misiles estan limitados por la capacidad del Silo de Misiles:

```
capacidad_silo = nivel_silo * 10
misiles_totales = misiles_antibalisticos + (2 * misiles_interplanetarios)

Si misiles_totales >= capacidad_silo:
    No se pueden construir mas misiles
```

**Nota:** Cada misil interplanetario ocupa 2 espacios.

---

## Requisitos de Construccion

### Tabla de Requisitos

| Defensa | Requisitos |
|---------|------------|
| Lanzamisiles | Astillero 1 |
| Laser Ligero | Astillero 2, Energia 1, Laser 3 |
| Laser Pesado | Astillero 4, Energia 3, Laser 6 |
| Canon Gauss | Astillero 6, Energia 6, Armas 3, Escudos 1 |
| Canon Ionico | Astillero 4, Ionica 4 |
| Torreta Plasma | Astillero 8, Plasma 7 |
| Cupula Pequena | Astillero 1, Escudos 2 |
| Cupula Grande | Astillero 6, Escudos 6 |
| Misil Antibalistico | Silo 2 |
| Misil Interplanetario | Silo 4, Impulso 1 |

---

## Formula de Tiempo de Construccion

### Formula General

```
tiempo_segundos = ((costo_metal + costo_cristal) / (2500 * (1 + nivel_astillero))) * 3600 / reduccion_nanobots / velocidad_juego
```

**Identica a la formula de naves.**

### Tiempo para Multiples Unidades

```
tiempo_total = tiempo_por_unidad * cantidad
```

---

## Sistema de Reconstruccion Post-Combate

### Mecanica

Despues de un combate, las defensas destruidas tienen un **70% de probabilidad** de reconstruirse automaticamente:

```
Para cada defensa destruida:
    Si random() < 0.70:
        Defensa se reconstruye
    Si no:
        Defensa se pierde permanentemente
```

### Con Bonus de Ingeniero (oficial)

El Ingeniero reduce las perdidas de defensas en un 50%:

```
probabilidad_reconstruccion = 0.70 + (0.30 * 0.50) = 0.85
```

Efectivamente, con Ingeniero, el 85% de las defensas destruidas se reconstruyen.

---

## Sistema de Misiles

### Misiles Antibalisticos

**Funcion:** Interceptan misiles interplanetarios entrantes

**Mecanica:**
```
Por cada misil interplanetario atacante:
    Si hay misil antibalistico disponible:
        Destruir ambos misiles (1:1)
    Si no:
        Misil interplanetario impacta
```

### Misiles Interplanetarios

**Funcion:** Destruyen defensas enemigas a distancia

**Alcance:**
```
alcance_sistemas = (nivel_impulso * 5) - 1
```

**Ejemplo:** Con Impulso nivel 8, alcance = (8 * 5) - 1 = 39 sistemas

**Mecanica de Dano:**
```
dano_total = 12000 + (nivel_armas * 1200)

// El dano se aplica secuencialmente a las defensas
// empezando por las mas baratas
```

**Proceso de Impacto:**
```
1. Verificar si hay misiles antibalisticos
2. Destruir antibalisticos 1:1
3. Misiles restantes causan dano
4. Dano se aplica a defensas mas baratas primero
5. Continuar hasta agotar dano
```

**Orden de Destruccion (prioridad):**
1. Lanzamisiles
2. Laser Ligero
3. Laser Pesado
4. Canon Ionico
5. Canon Gauss
6. Torreta Plasma
7. Cupulas (ultimo)

---

## Validacion de Construccion

### Cupulas de Escudo

```
cantidad_actual = contar cupulas del tipo en planeta
cantidad_en_cola = contar cupulas del tipo en shipyard_queue

Si cantidad_actual + cantidad_en_cola >= 1:
    ERROR: "Solo se puede tener 1 cupula de este tipo"
```

### Misiles

```
misiles_antibalisticos_actuales = contar en planeta
misiles_interplanetarios_actuales = contar en planeta
misiles_en_cola_anti = contar en shipyard_queue tipo antibalistico
misiles_en_cola_inter = contar en shipyard_queue tipo interplanetario

espacio_usado = (misiles_antibalisticos_actuales + misiles_en_cola_anti) +
                2 * (misiles_interplanetarios_actuales + misiles_en_cola_inter)

espacio_requerido = cantidad_solicitada * (1 si antibalistico, 2 si interplanetario)

Si espacio_usado + espacio_requerido > capacidad_silo:
    ERROR: "Capacidad del silo insuficiente"
```

---

## Comportamiento en Combate

### Participacion

Las defensas participan en el combate igual que las naves:
- Tienen escudos que absorben dano
- Tienen casco que se destruye
- Tienen armas que causan dano
- Son vulnerables a fuego rapido

### Fuego Rapido Contra Defensas

| Atacante | Defensa | Valor |
|----------|---------|-------|
| Crucero | Lanzamisiles | 10 |
| Bombardero | Lanzamisiles | 20 |
| Bombardero | Laser Ligero | 20 |
| Bombardero | Laser Pesado | 10 |
| Bombardero | Canon Ionico | 10 |
| Bombardero | Canon Gauss | 5 |
| Bombardero | Torreta Plasma | 5 |
| Destructor | Laser Ligero | 10 |
| Estrella Muerte | Lanzamisiles | 200 |
| Estrella Muerte | Laser Ligero | 200 |
| Estrella Muerte | Laser Pesado | 100 |
| Estrella Muerte | Canon Ionico | 100 |
| Estrella Muerte | Canon Gauss | 50 |

### Cupulas de Escudo en Combate

Las cupulas actuan como unidades con:
- Escudo muy alto (2000 / 10000)
- Armas minimas (1)
- Casco alto (20000 / 100000)

Son las ultimas en ser destruidas y protegen mientras tengan escudo.

---

## Proceso de Agregar a Cola

### Funcion: secure_add_to_shipyard_queue (defensas)

**Paso 1: Validaciones Especiales**
```
Si tipo == cupula_pequena O tipo == cupula_grande:
    Verificar limite de 1 por planeta

Si tipo == misil_antibalistico O tipo == misil_interplanetario:
    Verificar capacidad del silo
```

**Paso 2: Validaciones Generales**
```
1. Verificar astillero existe
2. Verificar requisitos de tecnologia
3. Verificar recursos suficientes
```

**Paso 3: Procesar**
```
1. Descontar recursos
2. Calcular tiempo
3. Insertar en shipyard_queue con item_type = 'defense'
```

---

## Funcion RPC: launch_interplanetary_missile

### Parametros

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| p_origin_planet_id | UUID | Planeta de origen |
| p_target_galaxy | INTEGER | Galaxia destino |
| p_target_system | INTEGER | Sistema destino |
| p_target_position | INTEGER | Posicion destino |
| p_quantity | INTEGER | Cantidad de misiles |
| p_primary_target | TEXT | Tipo de defensa prioritaria (opcional) |

### Logica

```
1. Verificar usuario tiene misiles interplanetarios
2. Calcular alcance
3. Verificar destino en alcance
4. Buscar planeta en coordenadas destino
5. Verificar planeta tiene defensas
6. Descontar misiles del origen
7. Calcular misiles antibalisticos del defensor
8. Calcular destruccion 1:1
9. Calcular dano de misiles restantes
10. Aplicar dano a defensas
11. Notificar al defensor
12. Retornar resultado
```

### Retorno

```json
{
  "success": true,
  "missiles_launched": 5,
  "missiles_intercepted": 2,
  "missiles_impacted": 3,
  "damage_dealt": 43200,
  "defenses_destroyed": {
    "rocket_launcher": 12,
    "light_laser": 8,
    "heavy_laser": 2
  }
}
```

---

## Tabla: planet_defenses

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | UUID | ID unico |
| planet_id | UUID | Planeta |
| defense_type_id | TEXT | Tipo de defensa |
| quantity | INTEGER | Cantidad actual |
| updated_at | TIMESTAMP | Ultima actualizacion |

---

## Consideraciones de Seguridad

### RLS para planet_defenses

```sql
CREATE POLICY "Users can view own defenses"
  ON planet_defenses FOR SELECT
  TO authenticated
  USING (
    planet_id IN (SELECT id FROM planets WHERE user_id = auth.uid())
  );
```

### Validaciones Criticas

1. **Verificar limite de cupulas** - Maximo 1 de cada tipo
2. **Verificar capacidad silo** - Para misiles
3. **Verificar alcance misiles** - Usar formula del impulso
4. **Validar cantidad positiva** - quantity > 0
5. **Usar transacciones** - Para atomicidad
6. **Bloquear durante combate** - Evitar race conditions
