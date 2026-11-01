# Documentacion de Migracion a Backend - Indice General

## Proposito

Esta documentacion describe en detalle todas las logicas del juego Falco-X Universo para facilitar la migracion completa de la logica al backend (Supabase). Cada documento explica las formulas, procesos paso a paso, validaciones y consideraciones de seguridad.

---

## Documentos Disponibles

### 01. Sistema de Planetas
**Archivo:** `01_SISTEMA_DE_PLANETAS.md`

Contenido:
- Estructura de datos de planetas
- Formulas de generacion (campos, temperatura, diametro)
- Proceso de creacion de planeta inicial
- Colonizacion de nuevos planetas
- Sistema de lunas
- Validaciones y seguridad

---

### 02. Sistema de Recursos y Produccion
**Archivo:** `02_SISTEMA_DE_RECURSOS_Y_PRODUCCION.md`

Contenido:
- Tipos de recursos (metal, cristal, deuterio, energia)
- Formulas de produccion por mina
- Sistema de energia (consumo y produccion)
- Formula de capacidad de almacenamiento
- Proceso completo de calculo de recursos
- Sincronizacion cliente-servidor

---

### 03. Sistema de Edificios y Construccion
**Archivo:** `03_SISTEMA_DE_EDIFICIOS_Y_CONSTRUCCION.md`

Contenido:
- Categorias de edificios
- Formulas de costos
- Formula de tiempo de construccion
- Sistema de requisitos
- Sistema de cola de construccion
- Proceso de completar construccion
- Cancelacion y completar con FXU

---

### 04. Sistema de Investigacion
**Archivo:** `04_SISTEMA_DE_INVESTIGACION.md`

Contenido:
- Categorias de tecnologias
- Formulas de costos de investigacion
- Tecnologia Graviton (requisito especial de energia)
- Formula de tiempo de investigacion
- Red Intergalactica (IRN)
- Efectos de cada tecnologia
- Bonus del Tecnocrata

---

### 05. Sistema de Naves y Astillero
**Archivo:** `05_SISTEMA_DE_NAVES_Y_ASTILLERO.md`

Contenido:
- Categorias de naves
- Especificaciones (velocidad, carga, consumo, combate)
- Formulas de velocidad por tipo de motor
- Sistema de fuego rapido
- Requisitos de construccion
- Cola del astillero

---

### 06. Sistema de Defensas
**Archivo:** `06_SISTEMA_DE_DEFENSAS.md`

Contenido:
- Tipos de defensas
- Limites de construccion (cupulas, misiles)
- Formula de tiempo de construccion
- Sistema de reconstruccion post-combate
- Sistema de misiles interplanetarios
- Comportamiento en combate

---

### 07. Sistema de Flotas
**Archivo:** `07_SISTEMA_DE_FLOTAS.md`

Contenido:
- Tipos de misiones
- Formulas de distancia
- Formula de tiempo de vuelo
- Formula de consumo de combustible
- Capacidad de carga
- Slots de flota
- Proceso de envio y llegada
- Proteccion noob y anti-bashing
- Cancelacion y aceleracion

---

### 08. Sistema de Combate
**Archivo:** `08_SISTEMA_DE_COMBATE.md`

Contenido:
- Mecanica general (fases, rondas)
- Estadisticas con tecnologia
- Simulacion de rondas
- Aplicacion de dano
- Sistema de fuego rapido en detalle
- Calculo de escombros (30%)
- Calculo de botin (50% max)
- Reconstruccion de defensas (70%)
- Creacion de luna
- Sistema ACS

---

### 09. Sistema de Expediciones
**Archivo:** `09_SISTEMA_DE_EXPEDICIONES.md`

Contenido:
- Requisitos (astrofisica)
- Slots y duracion
- Proceso de envio
- Tipos de resultados
- Calculo de recompensas
- Eventos negativos
- Pool de expedicion
- Restriccion de sondas

---

### 10. Sistema de Mercado
**Archivo:** `10_SISTEMA_DE_MERCADO.md`

Contenido:
- Tipos de listados (recursos, naves)
- Estructura de listados
- Proceso de crear listado
- Proceso de compra
- Comisiones y distribucion
- Auto-cancelacion de listados
- Notificaciones

---

### 11. Sistema de Alianzas
**Archivo:** `11_SISTEMA_DE_ALIANZAS.md`

Contenido:
- Estructura de alianza
- Sistema de rangos y permisos
- Crear alianza
- Sistema de aplicaciones
- Expulsar miembros
- Transferir liderazgo
- Sistema de guerras
- Restriccion de transporte
- Sistema ACS (ataque coordinado)

---

### 12. Sistema de Oficiales
**Archivo:** `12_SISTEMA_DE_OFICIALES.md`

Contenido:
- Tipos de oficiales y sus bonus
- Duraciones disponibles
- Sistema de precios
- Proceso de compra
- Aplicacion de bonus en backend
- Bloqueo de recompra

---

### 13. Sistema de Puntos y Ranking
**Archivo:** `13_SISTEMA_DE_PUNTOS_Y_RANKING.md`

Contenido:
- Categorias de puntos
- Formula de calculo
- Puntos de flota (incluye flotas en vuelo)
- Funcion de actualizacion de puntos
- Sistema de ranking
- Ranking de alianzas
- Proteccion noob basada en puntos
- Hall of Fame

---

### 14. Sistema FXU y Jackpot
**Archivo:** `14_SISTEMA_FXU_Y_JACKPOT.md`

Contenido:
- Obtencion y usos de FXU
- Calculo de costo FXU para completar
- Sistema de Jackpot (pools, contribucion, ganar)
- Depositos y retiros
- Swap FXU/USDT
- Sistema Plus
- Admin revenue tracking
- Proteccion de balance

---

## Resumen de Formulas Clave

### Produccion
```
Metal: 30 * nivel * (1.1)^nivel * velocidad
Cristal: 20 * nivel * (1.1)^nivel * velocidad
Deuterio: 10 * nivel * (1.1)^nivel * factor_temp * velocidad
```

### Tiempos
```
Edificio: (metal + cristal) / (2500 * (1 + robotica)) / 2^nanobots / velocidad
Investigacion: (metal + cristal) / (1000 * (1 + lab_efectivo)) / velocidad
Astillero: (metal + cristal) / (2500 * (1 + astillero)) / 2^nanobots / velocidad
```

### Combate
```
Armas: base * (1 + nivel_armas * 0.10)
Escudo: base * (1 + nivel_escudos * 0.10)
Casco: base * (1 + nivel_blindaje * 0.10)
Escombros: 30% del costo (metal + cristal)
Botin: max 50% de recursos del defensor
Reconstruccion defensas: 70%
```

### Puntos
```
puntos = (metal + cristal + deuterio) / 1000
```

---

## Principios de Seguridad

1. **Nunca confiar en datos del cliente**
2. **Validar todo en backend**
3. **Usar transacciones atomicas**
4. **Implementar RLS en todas las tablas**
5. **Usar FOR UPDATE SKIP LOCKED** para evitar race conditions
6. **Registrar todas las transacciones** para auditoria
7. **Proteger balances** con triggers

---

## Notas de Implementacion

- Todas las formulas deben implementarse en funciones RPC de Supabase
- El cliente solo debe mostrar UI y cache local
- El servidor es autoritativo para todo el estado del juego
- Usar cron jobs para procesamiento periodico (flotas, ranking)
- Implementar rate limiting para operaciones sensibles
