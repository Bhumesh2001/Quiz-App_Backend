const mongoose = require('mongoose');
const Quiz = require('../models/Quiz');
const QuizRecord = require('../models/QuizRecord');
const { ObjectId } = mongoose.Types;
const { uploadImage, deleteImage } = require('../utils/image');
const { flushCacheByKey } = require("../middlewares/cacheMiddle");

// **Create Quiz**
exports.createQuiz = async (req, res, next) => {
    const {
        classId, subjectId, chapterId, categoryId, quizTitle, quizTime, description, status
    } = req.body;

    try {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ success: false, messeage: 'No files were uploaded.' });
        };
        const imageData = await uploadImage(req.files.imageUrl.tempFilePath, 'CysQuizzesImg', 220, 200);
        const quiz = new Quiz({
            classId, subjectId, chapterId, categoryId, quizTitle, quizTime, description, status,
            imageUrl: imageData.url,
            publicId: imageData.publicId,
        });

        flushCacheByKey('/api/quizzess');
        flushCacheByKey('/api/dashboard/stats');

        await quiz.save();
        res.status(201).json({ success: true, message: 'Quiz created successfully', quiz });
    } catch (error) {
        next(error);
    };
};

// **Get All Quizzes**
exports.getQuizzes = async (req, res, next) => {
    try {
        const quizzes = await Quiz.find({},
            { createdAt: 0, updatedAt: 0, classId: 0, subjectId: 0, chapterId: 0, categoryId: 0 }
        ).lean();
        res.status(200).json({
            success: true,
            message: 'Quizes fetched successfully...!',
            totaQuizess: quizzes.length,
            data: quizzes
        });
    } catch (error) {
        next(error);
    }
};

// **submit quiz**
exports.submitQuiz = async (req, res, next) => {
    const { userId, quizId, userAnswers } = req.body;

    try {
        // Convert quizId to ObjectId if needed
        const quizObjectId = ObjectId.isValid(quizId) ? new ObjectId(quizId) : null;
        if (!quizObjectId) {
            return res.status(400).json({ success: false, message: 'Invalid quizId format.' });
        }

        // Fetch quiz and related questions using aggregation
        const quizData = await Quiz.aggregate([
            { $match: { _id: quizObjectId } }, // Match by ObjectId
            {
                $lookup: {
                    from: 'questions',
                    localField: 'categoryId',
                    foreignField: 'categoryId',
                    as: 'questions',
                },
            },
        ]);

        // Check if quiz exists
        if (!quizData.length) {
            return res.status(404).json({ success: false, message: 'Quiz not found.' });
        }

        const quiz = quizData[0];
        const { questions } = quiz;

        if (!questions.length) {
            return res.status(404).json({ success: false, message: 'No questions found for this category.' });
        }

        // Calculate the score by comparing user answers with correct answers
        const score = questions.reduce((acc, question, index) => {
            return acc + (userAnswers[index] === question.answer ? 1 : 0);
        }, 0);

        // Update or create quiz record in one query
        await QuizRecord.findOneAndUpdate(
            { userId, quizId },
            {
                $set: { score, attemptedAt: new Date() },
                $inc: { attempts: 1 },
            },
            { upsert: true, new: true }
        );

        // Return response
        res.status(200).json({
            success: true,
            message: 'Quiz submitted successfully!',
            score,
        });
    } catch (error) {
        next(error);
    }
};

// **Get Quiz by ID**
exports.getQuizById = async (req, res, next) => {
    try {
        const quiz = await Quiz.findById(
            req.params.quizId,
            { createdAt: 0, updatedAt: 0, classId: 0, subjectId: 0, chapterId: 0, categoryId: 0 }
        ).lean();

        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        res.json({ success: true, message: 'Quiz fetched successfully...!', quiz });
    } catch (error) {
        next(error);
    }
};

// Get Quiz by Chapter ID
exports.getQuizByChapterId = async (req, res, next) => {
    try {
        // Find a single quiz by chapterId
        const quiz = await Quiz.findOne(
            { chapterId: req.params.chapterId },
            { createdAt: 0, updatedAt: 0, classId: 0, subjectId: 0, chapterId: 0 } // Exclude non-essential fields
        ).lean();

        // Return 404 if no quiz is found
        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'No quiz found for this chapter',
            });
        }

        // Fetch questions for the quiz's categoryId
        if (quiz.categoryId) {
            const questions = await mongoose.model('Question').find(
                { categoryId: quiz.categoryId },
                {
                    createdAt: 0,
                    updatedAt: 0,
                    answer: 0,
                    categoryId: 0,
                    chapterId: 0,
                    questionType: 0,
                    status: 0,
                } // Exclude unwanted fields
            ).lean();

            quiz.questions = questions.length ? questions : []; // Add questions to the quiz object
        } else {
            quiz.questions = []; // Handle case where categoryId is not available
        }

        res.status(200).json({
            success: true,
            message: 'Quiz retrieved successfully',
            data: quiz, // Returning a single quiz object
        });
    } catch (error) {
        next(error);
    }
};

// **Update Quiz**
exports.updateQuiz = async (req, res, next) => {
    const {
        classId, subjectId, chapterId, categoryId, quizTitle, quizTime, description, status
    } = req.body;
    try {
        let imageData = {}; // Initialize an empty object to store image data
        if (req.files && Object.keys(req.files).length !== 0) {
            // If a new image is uploaded
            const quizData = await Quiz.findById(req.params.quizId, { publicId: 1 });
            if (quizData && quizData.publicId) {
                // If the category already has an image, delete the old one
                await deleteImage(quizData.publicId);
            }
            imageData = await uploadImage(req.files.imageUrl.tempFilePath, 'CysQuizzesImg', 220, 200);
        } else {
            // If no new image is provided, use the current image data
            const quizData = await Quiz.findById(req.params.quizId, { imageUrl: 1, publicId: 1 });
            imageData.url = quizData.imageUrl;
            imageData.publicId = quizData.publicId;
        };

        const quiz = await Quiz.findByIdAndUpdate(
            req.params.quizId,
            {
                classId, subjectId, chapterId, categoryId, quizTitle, quizTime, description, status,
                imageUrl: imageData.url,
                publicId: imageData.publicId
            },
            { new: true, runValidators: true }
        );

        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        };

        flushCacheByKey('/api/quizzess');
        flushCacheByKey(req.originalUrl);

        res.status(200).json({ success: false, message: 'Quiz updated successfully', quiz });
    } catch (error) {
        next(error);
    };
};

// **Delete Quiz**
exports.deleteQuiz = async (req, res, next) => {
    try {
        const quizData = await Quiz.findById(req.params.quizId, { publicId: 1 });
        if (quizData && quizData.publicId) await deleteImage(quizData.publicId);

        const quiz = await Quiz.findByIdAndDelete(req.params.quizId);
        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        };

        flushCacheByKey('/api/quizzess');
        flushCacheByKey(req.originalUrl);
        flushCacheByKey('/api/dashboard/stats');

        res.status(200).json({ success: false, message: 'Quiz deleted successfully' });
    } catch (error) {
        next(error);
    };
};
