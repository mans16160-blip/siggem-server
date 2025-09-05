const logger = require("../logger");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");
const mime = require("mime-types");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

exports.uploadToS3 = async (
  buffers,
  {
    bucket = process.env.S3_BUCKET,
    region = process.env.AWS_REGION,
    prefix = "uploads/",
    contentTypes = [],
    public: makePublic = true,
    signedTtl = 3600,
  } = {},
) => {
  logger.info(
    `Starting S3 upload: bucket=${bucket}, region=${region}, files=${Array.isArray(buffers) ? buffers.length : 1}, public=${makePublic}`,
  );

  if (!Array.isArray(buffers)) buffers = [buffers];

  const urls = [];

  for (let i = 0; i < buffers.length; i++) {
    logger.info(`Preparing upload for file ${i + 1}/${buffers.length}...`);

    const buffer = buffers[i];
    if (!buffer) {
      logger.warn(`File ${i + 1} buffer is empty, skipping.`);
      continue;
    }
    //Specificera innehållstyp
    const contentType = contentTypes[i] || "image/png";
    const ext = mime.extension(contentType) || "png";
    // Skapa nyckel
    const key = `${prefix}${new Date().toISOString().slice(0, 10)}/${uuidv4()}.${ext}`;
    logger.debug(
      `Generated S3 key for file ${i + 1}: ${key} (contentType=${contentType})`,
    );

    try {
      //Ladda upp fllen till S3
      const uploader = new Upload({
        client: s3,
        params: {
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        },
        queueSize: 4,
        partSize: 10 * 1024 * 1024, // 10 MB
        leavePartsOnError: false,
      });

      logger.info(`Uploading file ${i + 1}/${buffers.length} to S3...`);
      await uploader.done();
      logger.info(
        `Successfully uploaded file ${i + 1}/${buffers.length} to S3: ${key}`,
      );

      let url;
      //Generera bildlänk
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      url = await getSignedUrl(s3, command, { expiresIn: signedTtl });
      logger.debug(
        `Signed URL generated for file ${i + 1} (expires in ${signedTtl}s)`,
      );

      //Lägg till länken i arrayen
      urls.push(url);
    } catch (uploadErr) {
      logger.error(
        `Upload failed for file ${i + 1}/${buffers.length}: ${uploadErr.message}`,
        uploadErr,
      );
      throw uploadErr;
    }
  }

  logger.info(`Completed S3 upload. Total files uploaded: ${urls.length}`);
  return urls;
};
