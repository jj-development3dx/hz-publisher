# Guía de Instalación

## Requisitos Previos
- Node.js instalado

### 1. Configurar el archivo de entorno
Renombra el archivo `.env.example` a `.env`
```
ren .env.example .env
```

### 2. Navegar a la carpeta f95-api
```
cd f95-api
```

### 3. Instalar pnpm globalmente
```
npm install -g pnpm@latest
```

### 4. Instalar las dependencias de f95-api
```
pnpm install
```

### 5. Compilar f95-api
```
pnpm run build
```

### 6. Volver a la carpeta principal e instalar f95-api localmente
```
cd ..
npm install ./f95-api/ --legacy-peer-deps
```
> Nota: Es importante especificar la ruta correcta a la carpeta f95-api. Si estás en la carpeta raíz del proyecto, el comando anterior funcionará.

### 7. Instalar las dependencias del bot
```
npm install --legacy-peer-deps
```

### 8. Compilar el bot
```
npm run build
```

### 9. Iniciar el bot
```
npm start
```

## Configuración Importante
Asegúrate de rellenar todos los datos necesarios en el archivo `.env` antes de iniciar el bot.

## Registrar comandos
Antes de invitar al bot al discord, para que registre el comando de /f95, el bot tiene que estar fuera del discord y después de haber iniciado el bot, invitarlo
