export function formatLink(url: string, label: string): string {
  if (!url) return "";
  return `[${label}](${url})`;
} 

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as sharp from 'sharp';
import { Client, ChannelType, TextChannel, AttachmentBuilder } from 'discord.js';
import { config } from '../config';
import { login } from 'f95api';
import { updateSession } from 'f95api/dist/src/scripts/network-helper';

const FALLBACK_IMAGE = 'https://cdn.discordapp.com/attachments/1143524516156051456/1147920354753704096/logo.png';

let lastLoginTime = 0;
const SESSION_REFRESH_INTERVAL = 10 * 60 * 1000;

export async function ensureF95Session(): Promise<boolean> {
  try {
    const currentTime = Date.now();
    
    if (lastLoginTime === 0 || currentTime - lastLoginTime > SESSION_REFRESH_INTERVAL) {
      console.log('F95Zone session needs refresh or initial login');
      
      try {
        if (lastLoginTime > 0) {
          console.log('Attempting to refresh existing F95Zone session...');
          await updateSession();
          console.log('F95Zone session refreshed successfully');
        } else {
          console.log('Performing initial F95Zone login...');
          await login(config.F95_LOGIN_USER, config.F95_LOGIN_PASSWORD);
          console.log('F95Zone login successful');
        }
        
        lastLoginTime = currentTime;
        return true;
      } catch (error) {
        console.error('Error during session refresh, attempting full login:', error);
        
        try {
          await login(config.F95_LOGIN_USER, config.F95_LOGIN_PASSWORD);
          console.log('F95Zone login successful after refresh failure');
          lastLoginTime = currentTime;
          return true;
        } catch (loginError) {
          console.error('Critical: F95Zone login failed:', loginError);
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Unexpected error in ensureF95Session:', error);
    return false;
  }
}

export function cleanupTempFiles(maxAge: number = 3600000): void {
  try {
    const cacheDir = path.join(process.cwd(), 'cache');
    if (!fs.existsSync(cacheDir)) return;
    
    console.log('Cleaning up temporary files...');
    const files = fs.readdirSync(cacheDir);
    const currentTime = Date.now();
    
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      const stats = fs.statSync(filePath);
      
      if (currentTime - stats.mtimeMs > maxAge) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Removed old temporary file: ${file}`);
        } catch (err) {
          console.error(`Failed to remove temporary file ${file}:`, err);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up temporary files:', error);
  }
}

setInterval(() => {
  cleanupTempFiles();
}, 60 * 60 * 1000);

export async function safeDownloadImage(url: string, filename: string): Promise<string | null> {
  const tempPath = path.join(process.cwd(), 'cache', `${filename.replace(/\.[^/.]+$/, '')}_temp`);
  
  try {
    return await downloadImage(url, filename);
  } catch (error) {
    console.error(`Error in downloadImage for ${url}:`, error);
    return null;
  } finally {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (unlinkError) {
        console.error(`Error deleting temp file ${tempPath}:`, unlinkError);
      }
    }
  }
}

export async function downloadImage(url: string, filename: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const debugLog = (message: string) => {
      if (config.DEBUG_MODE) {
        console.log(`[DEBUG] ${message}`);
      }
    };
    
    const debugError = (message: string, error?: any) => {
      if (config.DEBUG_MODE) {
        if (error) {
          console.error(`[DEBUG ERROR] ${message}:`, error);
        } else {
          console.error(`[DEBUG ERROR] ${message}`);
        }
      }
    };

    let processedUrl = url;
    try {
      if (!url) throw new Error("URL is empty or undefined.");
      processedUrl = url.trim();
      if (processedUrl.startsWith('http:')) {
        processedUrl = processedUrl.replace('http:', 'https');
      }
      processedUrl = processedUrl.replace(/\s/g, '%20');
      new URL(processedUrl);
    } catch(e) {
      debugError(`Invalid image URL provided: ${url}`, e);
      resolve(null);
      return;
    }
    
    const cacheDir = path.join(process.cwd(), 'cache');
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (mkdirError) {
        debugError(`Failed to create cache directory: ${cacheDir}`, mkdirError);
        reject(mkdirError);
        return;
      }
    }
    
    const fileBase = filename.replace(/\.[^/.]+$/, '');
    const filePath = path.join(cacheDir, `${fileBase}.png`);
    const tempPath = path.join(cacheDir, `${fileBase}_temp`);
    
   
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
        debugLog(`Removed existing temp file: ${tempPath}`);
      } catch (unlinkErr) {
        debugError(`Error removing existing temp file: ${tempPath}`, unlinkErr);
      }
    }

    if (fs.existsSync(filePath)) {
      debugLog(`Image already cached: ${filePath}`);
      resolve(filePath);
      return;
    }
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://f95zone.to/'
      },
      timeout: 15000
    };
    
    debugLog(`Downloading image from: ${processedUrl}`);
    
    const request = https.get(processedUrl, options, (response) => {
      if (response.statusCode !== 200) {
        debugError(`Error downloading image: Status code ${response.statusCode} for URL ${processedUrl}`);
       
        response.resume();
        resolve(null);
        return;
      }
      
      debugLog(`Response received with status code: ${response.statusCode}`);
      
      const fileStream = fs.createWriteStream(tempPath);
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close(async (closeErr) => {
          if (closeErr) {
            debugError(`Error closing file stream for ${tempPath}`, closeErr);
           
            try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
            resolve(null);
            return;
          }

          debugLog(`Temporary image downloaded: ${tempPath}`);
          debugLog(`Starting conversion to PNG with Sharp...`);

          try {
            await sharp.default(tempPath)
              .png()
              .toFile(filePath);
            
            debugLog(`Image converted to PNG: ${filePath}`);
            resolve(filePath);

          } catch (convErr: any) {
            debugError(`Error converting image to PNG: ${convErr.message}`, convErr);
           
           
            try {
              debugLog(`Conversion failed. Trying to use temp file: ${tempPath}`);
              fs.renameSync(tempPath, filePath);
              debugLog(`Temp file renamed to: ${filePath}`);
              resolve(filePath); 
            } catch (renameErr: any) {
              debugError(`Failed to rename temp file after conversion error: ${renameErr.message}`, renameErr);
              resolve(null);
            }        
          } finally {
            
             if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch (e) { debugError('Error cleaning up temp file in finally block', e); }
             }
          }
        });
      });
      
      fileStream.on('error', (err) => {
        debugError(`Error writing temp file: ${err.message}`, err);
        try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
        resolve(null);
      });

      response.setTimeout(30000, () => {
        console.error(`Response timeout for image URL: ${processedUrl}`);
        fileStream.close();
        try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
        resolve(null);
      });
    });

    request.on('timeout', () => {
      request.destroy();
      debugError(`Request timed out for image URL: ${processedUrl}`);
      try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
      resolve(null);
    });

    request.on('error', (err) => {
      debugError(`HTTP request error for image URL ${processedUrl}: ${err.message}`, err);
      try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
      resolve(null);
    });
  });
}


export async function uploadImageToDiscord(client: Client, imagePath: string | null, filename: string): Promise<string> {
  if (!imagePath) {
    console.log("No local image path provided, returning fallback image.");
    return FALLBACK_IMAGE;
  }

  if (!config.DISCORD_IMAGES_CHANNEL_ID) {
    console.error('DISCORD_IMAGES_CHANNEL_ID is not configured. Cannot upload image.');
    return FALLBACK_IMAGE; 
  }

  try {
    const channel = await client.channels.fetch(config.DISCORD_IMAGES_CHANNEL_ID);
    
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.error(`Images channel (${config.DISCORD_IMAGES_CHANNEL_ID}) not found or is not a text channel.`);
      return FALLBACK_IMAGE;
    }
    
    const textChannel = channel as TextChannel;
    
   
    const pngFilename = filename.endsWith('.png') ? filename : `${filename.replace(/\.[^/.]+$/, '')}.png`;
    
    const attachment = new AttachmentBuilder(imagePath, { 
      name: pngFilename,
      description: "Game cover image"
    });
    
    console.log(`Uploading image ${imagePath} to Discord channel: ${config.DISCORD_IMAGES_CHANNEL_ID}`);
    const message = await textChannel.send({ files: [attachment] });
    
    if (message.attachments.size > 0) {
      const imageUrl = message.attachments.first()?.url;
      if (imageUrl) {
        console.log(`Image uploaded successfully to Discord. URL: ${imageUrl}`);
        return imageUrl;
      }
    }
    
    console.error('Failed to get URL from uploaded image attachment.');
    return FALLBACK_IMAGE;

  } catch (error) {
    console.error(`Error uploading image ${imagePath} to Discord:`, error);
    return FALLBACK_IMAGE; 
  }
} 