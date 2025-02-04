const Chapter = require('../models/Chapter');
const { uploadImage, deleteImage, uploadPDFToCloudinary } = require('../utils/image');
const { flushAllCache } = require("../middlewares/cacheMiddle");

// **Create Chapter**
exports.createChapter = async (req, res, next) => {
    const { subjectId, name, description, status } = req.body;
    try {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(422).json({
                success: false,
                status: 422,
                messeage: 'No files were uploaded.'
            });
        };
        const imageData = await uploadImage(req.files.imageUrl.tempFilePath, 'CysChaptersImg', 220, 200);
        const pdfData = req.files?.pdfUrl ? await uploadPDFToCloudinary(req.files.pdfUrl.tempFilePath) : null;

        const newChapter = await Chapter.create({
            subjectId,
            name,
            description,
            imageUrl: imageData.url,
            publicId: imageData.publicId,
            pdfUrl: pdfData ? { url: pdfData.url, publicId: pdfData.publicId } : null,
            status,
        });

        flushAllCache();

        res.status(201).json({
            success: true,
            message: 'Chapter created successfully...!',
            data: newChapter
        });
    } catch (error) {
        next(error);
    };
};

// **Get Chapter by id**
exports.getChapterById = async (req, res, next) => {
    try {
        const chapter = await Chapter.findById(
            req.params.chapterId,
            { createdAt: 0, updatedAt: 0, publicId: 0 }
        )
            .populate('subjectId', 'name')
            .lean();

        if (!Chapter) return res.status(404).json({ success: false, message: 'Chapter not found' });

        res.status(200).json({
            success: true,
            message: 'Chapter fetched successfully...!',
            data: chapter
        });
    } catch (error) {
        next(error);
    };
};

// Get Chapters by Subject ID
exports.getChaptersBySubjectId = async (req, res, next) => {
    try {
        // Find active chapters by subjectId
        const chapters = await Chapter.find({ subjectId: req.params.subjectId })
            .select('-createdAt -updatedAt -publicId')
            .lean();

        // Handle no chapters found
        if (!chapters.length) {
            return res.status(404).json({
                success: false,
                status: 404,
                message: 'No chapters found for this subject'
            });
        };

        // Respond with found chapters
        res.status(200).json({
            success: true,
            message: 'Chapters retrieved successfully',
            totalChapters: chapters.length,
            data: chapters,
        });
    } catch (error) {
        console.log(error);
        next(error);
    };
};

// **Get all Chapters**
exports.getAllChapter = async (req, res, next) => {
    try {
        const { page = 1, limit = 12 } = req.query; // Default to page 1 and limit 10 if not provided

        // Convert page and limit to integers
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);

        // Fetch paginated data
        const ChapterData = await Chapter.find({}, { name: 1, imageUrl: 1 })
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize)
            .lean();

        // Get the total count of chapters
        const totalChapters = await Chapter.countDocuments();

        res.status(200).json({
            success: true,
            message: 'Chapters fetched successfully...!',
            totalChapters,
            totalPages: Math.ceil(totalChapters / pageSize),
            currentPage: pageNumber,
            data: ChapterData,
        });
    } catch (error) {
        next(error);
    };
};

// **Update Chapter**
exports.updateChapter = async (req, res, next) => {
    const { subjectId, name, description, status } = req.body;

    try {
        // Helper function to handle image and PDF upload
        const handleFileUpload = async (fileKey, folder, isPDF = false) => {
            const file = req.files?.[fileKey];
            const chapterData = await Chapter.findById(
                req.params.chapterId,
                isPDF ? { pdfUrl: 1 } : { imageUrl: 1, publicId: 1 }
            );

            // If file is provided, delete the existing file and upload the new one
            if (file) {
                if (chapterData?.[isPDF ? 'pdfUrl' : 'publicId']?.publicId) {
                    await deleteImage(chapterData[isPDF ? 'pdfUrl' : 'publicId'].publicId);
                };
                return isPDF
                    ? await uploadPDFToCloudinary(file.tempFilePath)
                    : await uploadImage(file.tempFilePath, folder, 220, 200);
            };

            // If no new file, retain the existing data
            return chapterData[isPDF ? 'pdfUrl' : 'imageUrl'] || { url: null, publicId: null };
        };

        // Process image and PDF
        const imageData = await handleFileUpload('imageUrl', 'CysChaptersImg');
        const pdfData = await handleFileUpload('pdfUrl', null, true);

        // Update chapter with new or existing data
        const updatedChapter = await Chapter.findByIdAndUpdate(
            req.params.chapterId,
            {
                subjectId,
                name,
                description,
                status,
                imageUrl: imageData.url,
                publicId: imageData.publicId,
                pdfUrl: pdfData.url ? { url: pdfData.url, publicId: pdfData.publicId } : null,
            },
            { new: true, runValidators: true }
        );

        if (!updatedChapter) {
            return res.status(404).json({ success: false, status: 404, message: 'Chapter not found' });
        };

        // Clear caches and respond
        flushAllCache();

        res.status(200).json({
            success: true,
            message: 'Chapter updated successfully...!',
            data: updatedChapter,
        });
    } catch (error) {
        next(error);
    };
};

// **Delete Chapter**
exports.deleteChapter = async (req, res, next) => {
    try {
        const chapterData = await Chapter.findById(req.params.chapterId, { publicId: 1 });
        if (chapterData && chapterData.publicId) await deleteImage(chapterData.publicId);

        const deletedChapter = await Chapter.findByIdAndDelete(req.params.chapterId);
        if (!deletedChapter) {
            return res.status(404).json({ success: false, message: 'Chapter not found' });
        };

        flushAllCache();

        res.status(200).json({ success: true, message: 'Chapter deleted successfully' });
    } catch (error) {
        next(error);
    };
};
