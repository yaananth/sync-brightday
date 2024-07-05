const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();
const mime = require('mime-types');

// Function to get common headers
function getHeaders(jwt, cookie) {
    return {
        'Authorization': `Bearer ${jwt}`,
        'Cookie': cookie,
        'User-Agent': 'my-bright-day-store/11.180.23 CFNetwork/1496.0.7 Darwin/23.5.0',
        'Content-Type': 'application/json'
    };
}

// Function to fetch media data
async function fetchMediaData(headers, dependentId, startDate, endDate) {
    console.log(`Fetching media data for date range: ${startDate} to ${endDate}`);
    const url = `https://mbdgw.brighthorizons.com/parent/dependent/memories/media?start_date=${startDate}&end_date=${endDate}`;
    const response = await axios.post(
        url,
        [dependentId],
        {
            headers
        }
    );
    return response.data;
}

// Function to fetch media URL and details
async function fetchMediaDetails(headers, attachmentId) {
    console.log(`Fetching media details for attachment ID: ${attachmentId}`);
    const url = `https://mbdgw.brighthorizons.com/parent/media/${attachmentId}`;
    const response = await axios.get(url, {
        headers
    });
    return response.data;
}

// Function to download media
async function downloadMedia(url, outputPath) {
    console.log(`Downloading media from URL: ${url}`);
    const response = await axios.get(url, { responseType: 'stream' });
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        writer.on('finish', () => {
            console.log(`Download complete: ${outputPath}`);
            resolve();
        });
        writer.on('error', reject);
    });
}

// Function to get the correct file extension
function getCorrectFilePath(filename, mimeType) {
    const correctExtension = mime.extension(mimeType);
    if (correctExtension) {
        const extname = path.extname(filename);
        if (extname !== `.${correctExtension}`) {
            filename = filename.replace(extname, `.${correctExtension}`);
        }
    }
    return filename;
}

// Function to get the month folder path
function getMonthFolderPath(baseDir, dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return path.join(baseDir, `${year}-${month}`);
}

// Main function to handle the download and organization process
async function main() {
    const { JWT, COOKIE, DEPENDENT_ID, JOIN_DATE } = process.env;
    const outputDir = path.join(__dirname, 'output');
    const endDate = new Date().toISOString().split('T')[0];
    const headers = getHeaders(JWT, COOKIE);

    console.log('Starting media download...');
    console.log(`Child's join date: ${JOIN_DATE}`);
    console.log(`Fetching media up to: ${endDate}`);

    let currentDate = new Date(JOIN_DATE);
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    while (currentDate.toISOString().split('T')[0] <= endDate) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // Skip if the month folder already exists and it's not the current month
        if (year !== currentYear || month !== currentMonth) {
            const monthFolderPath = getMonthFolderPath(outputDir, currentDate.toISOString().split('T')[0]);
            if (fs.existsSync(monthFolderPath)) {
                console.log(`Skipping existing month: ${year}-${String(month + 1).padStart(2, '0')}`);
                currentDate.setMonth(currentDate.getMonth() + 1);
                continue;
            }
        }

        // Process the entire month
        let monthEndDate = new Date(currentDate);
        monthEndDate.setMonth(monthEndDate.getMonth() + 1);
        monthEndDate.setDate(0); // Last day of the current month
        const formattedEndDate = monthEndDate.toISOString().split('T')[0];

        const mediaData = await fetchMediaData(headers, DEPENDENT_ID, currentDate.toISOString().split('T')[0], formattedEndDate);

        if (mediaData.length === 0) {
            console.log(`No media found for month: ${year}-${String(month + 1).padStart(2, '0')}`);
            currentDate.setMonth(currentDate.getMonth() + 1);
            continue;
        }

        const monthFolderPath = getMonthFolderPath(outputDir, currentDate.toISOString().split('T')[0]);
        fs.ensureDirSync(monthFolderPath);
        console.log(`Created directory: ${monthFolderPath}`);

        for (const media of mediaData) {
            const mediaDetails = await fetchMediaDetails(headers, media.attachment_id);
            const mediaUrl = mediaDetails.signed_url;
            let mediaFilename = getCorrectFilePath(mediaDetails.filename, mediaDetails.mime_type);

            const mediaPath = path.join(monthFolderPath, mediaFilename);
            await downloadMedia(mediaUrl, mediaPath);
        }

        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    console.log('Media download complete.');
}

main().catch(console.error);
