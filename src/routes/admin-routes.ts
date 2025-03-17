import { Router } from "express";
import {  getAdminDetails, getDashboardStats, getNewUsers } from "../controllers/admin/admin-controller";
import { createEventHandler, getEventByIdHandler, updateEventHandler, deleteEventHandler, getAllEventsHandler } from "../controllers/events/events-controller";
import { createNewUser, deleteUser, getAllUser, getUser, getUserDashboardStats, updateUser } from "src/controllers/user/user-controller";
import { addBooksToCategory, createCategory, deleteCategory, getAllCategories, getCategory, updateCategory } from "src/controllers/categories/categories-controller";
import { addBooksToSubCategory, createSubCategory, deleteSubCategory, getAllSubCategory, getSubCategoriesByCategoryId, getSubCategory, updateSubCategory } from "src/controllers/sub-categories/sub-categories-controller";
import {  addBookToDiscounts, createBook, deleteBook, getAllBooks, getAllDiscountedBooks, getBook, removeBookFromDiscounts, updateBook } from "../controllers/products/products-controller";
import { createOrder, deleteOrder, getAllOrders, getOrder, updateOrder } from "src/controllers/orders/orders-controller";
import { createPublisher, deletePublisher, getAllPublishers, getPublisher, updatePublisher } from "src/controllers/publisher/publishers-controller";
import { createAuthor, deleteAuthor, getAllAuthors, getAuthor, updateAuthor } from "src/controllers/authors/authors-controller";
import { createStory, deleteStory, getAllStories, getStory, updateStory } from "src/controllers/stories/stories-controller";
import { createBanner, deleteBanner, getAllBanners, getBanner, updateBanner } from "src/controllers/banners/banners-controller";
import { addBooksToCollection, createCollection, deleteCollection, getAllCollections, getCollection, updateCollection } from "src/controllers/collections/collections-controller";
import { addBooksToSummary, createSummary, deleteSummary, getAllSummaries, getSummary, updateSummary } from "src/controllers/summaries/summaries-controller";
import { createDiscountVoucher, deleteDiscountVoucher, getAllDiscountVouchers, getDiscountVoucher, updateDiscountVoucher } from "src/controllers/discount-vouchers/discount-vouchers-controller";
import { createBookSchool, deleteBookSchool, getAllBookSchools, getBookSchool, updateBookSchool, verifyBookSchoolsByCode } from "src/controllers/book-schools/book-schools-controller";
import { createBookMaster, deleteBookMaster, getAllBookMasters, getAvailableProductsMasters, getBookMaster, updateBookMaster } from "src/controllers/book-masters/book-masters-controller";
import { createBookStudy, deleteBookStudy, getAllBookStudies, getAvailableProductsStudy, getBookStudy, updateBookStudy } from "src/controllers/book-studies/book-studies-controller";
import { createBookUniversity, deleteBookUniversity, getAllBookUniversities, getAvailableProductsUniversity, getBookUniversity, updateBookUniversity } from "src/controllers/book-universities/book-universities-controller";
import { createBookLive, deleteBookLive, getAllBookLives, getBookLive, updateBookLive } from "src/controllers/book-lives/book-lives-controller";
import { createBlog, deleteBlog, getAllBlogs, getBlogById, updateBlog } from "src/controllers/blogs/blogs-controller";
import { sendNotificationToUser, sendNotificationToUsers } from "src/controllers/notifications/notifications-controller";
import { createCourseLesson, deleteCourseLanguage, deleteCourseLesson, deleteSubLesson, getCourseLesson, updateCourseLesson } from "src/controllers/course-lessons/course-lessons-controller";

const router = Router();

router.get("/", getAdminDetails);
router.get("/dashboard", getDashboardStats);

//users routes
router.get("/new-users", getNewUsers);
// router.get("/", getNewUsers)
router.get("/user/:id", getUserDashboardStats);

// events routes

router.post("/events", createEventHandler);
router.get("/events", getAllEventsHandler);
router.get("/events/:id", getEventByIdHandler);
router.put("/events/:id", updateEventHandler);
router.delete("/events/:id", deleteEventHandler);

//categories routes

router.post("/categories", createCategory);
router.get("/categories", getAllCategories);
router.get("/categories/:id", getCategory);
router.get("/categories/:categoryId/sub-categories", getSubCategoriesByCategoryId);
router.put("/categories/:id", updateCategory);
router.put("/categories/:id/add", addBooksToCategory);
router.delete("/categories/:id", deleteCategory);

// sub-categories routes

router.post("/sub-categories", createSubCategory);
router.get("/sub-categories", getAllSubCategory);
router.get("/sub-categories/:id", getSubCategory);
router.put("/sub-categories/:id", updateSubCategory);
router.put("/sub-categories/:id/add", addBooksToSubCategory);
router.delete("/sub-categories/:id", deleteSubCategory);

// books routes
router.post("/books", createBook);
router.get("/books", getAllBooks);
router.get("/books/:id", getBook);
router.put("/books/:id", updateBook);
router.delete("/books/:id", deleteBook);
 
// course-lessons routes
router.post("/course-lessons", createCourseLesson);
router.get("/course-lessons/:id", getCourseLesson);
router.put("/course-lessons", updateCourseLesson);
router.delete("/course-lessons/:id", deleteCourseLesson);
router.delete("/course-lessons/:id/sub-lesson/:subLessonId", deleteSubLesson);
router.delete("/course-lessons/:productId/language", deleteCourseLanguage);
 
// discounted-books route
router.get("/discounted-books", getAllDiscountedBooks);

// booksToDiscount routes
router.put("/booksToDiscount", addBookToDiscounts);
router.put("/removeBooksFromDiscounts", removeBookFromDiscounts);

// users route
router.post("/users", createNewUser);
router.get("/users", getAllUser);
router.get("/users/:id", getUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// order route
router.post("/order", createOrder);
router.get("/order", getAllOrders);
router.get("/order/:id", getOrder);
router.put("/order/:id", updateOrder);
router.delete("/order/:id", deleteOrder);

// publishers route
router.post("/publishers", createPublisher);
router.get("/publishers", getAllPublishers);
router.get("/publishers/:id", getPublisher);
router.put("/publishers/:id", updatePublisher);
router.delete("/publishers/:id", deletePublisher);

// authors route
router.post("/authors", createAuthor);
router.get("/authors", getAllAuthors);
router.get("/authors/:id", getAuthor);
router.put("/authors/:id", updateAuthor);
router.delete("/authors/:id", deleteAuthor);

// stories route
router.post("/stories", createStory);
router.get("/stories", getAllStories);
router.get("/stories/:id", getStory);
router.put("/stories/:id", updateStory);
router.delete("/stories/:id", deleteStory);

// banners route
router.post("/banners", createBanner);
router.get("/banners", getAllBanners);
router.get("/banners/:id", getBanner);
router.put("/banners/:id", updateBanner);
router.delete("/banners/:id", deleteBanner);

// collections route
router.post("/collections", createCollection);
router.get("/collections", getAllCollections);
router.get("/collections/:id", getCollection);
router.put("/collections/:id", updateCollection);
router.put("/collections/:id/books", addBooksToCollection);
router.delete("/collections/:id", deleteCollection);

// summaries route
router.post("/summaries", createSummary);
router.get("/summaries", getAllSummaries);
router.get("/summaries/:id", getSummary);
router.put("/summaries/:id", updateSummary);
router.put("/summaries/:id/books", addBooksToSummary);
router.delete("/summaries/:id", deleteSummary);

// discount-vouchers route
router.post("/vouchers", createDiscountVoucher);
router.get("/vouchers", getAllDiscountVouchers);
router.get("/vouchers/:id", getDiscountVoucher);
router.put("/vouchers/:id", updateDiscountVoucher);
router.delete("/vouchers/:id", deleteDiscountVoucher);

// book-schools route
router.post("/book-schools", createBookSchool);
router.get("/book-schools", getAllBookSchools);
router.get("/book-masters/books", getAvailableProductsMasters);
router.get("/book-schools/:id", getBookSchool);
router.put("/book-schools/:id", updateBookSchool);
router.delete("/book-schools/:id", deleteBookSchool);

// book-masters route
router.post("/book-masters", createBookMaster);
router.get("/book-masters", getAllBookMasters);
router.get("/book-masters/books", getAvailableProductsMasters);
router.get("/book-masters/:id", getBookMaster);
router.put("/book-masters/:id", updateBookMaster);
router.delete("/book-masters/:id", deleteBookMaster);

// book-studies route
router.post("/book-studies", createBookStudy);
router.get("/book-studies", getAllBookStudies);
router.get("/book-studies/books", getAvailableProductsStudy);
router.get("/book-studies/:id", getBookStudy);
router.put("/book-studies/:id", updateBookStudy);
router.delete("/book-studies/:id", deleteBookStudy);

// book-universities route
router.post("/book-universities", createBookUniversity);
router.get("/book-universities", getAllBookUniversities);
router.get("/book-universities/books", getAvailableProductsUniversity);
router.get("/book-universities/:id", getBookUniversity);
router.put("/book-universities/:id", updateBookUniversity);
router.delete("/book-universities/:id", deleteBookUniversity);

// book-lives route
router.post("/book-lives", createBookLive);
router.get("/book-lives", getAllBookLives);
router.get("/book-lives/:id", getBookLive);
router.put("/book-lives/:id", updateBookLive);
router.delete("/book-lives/:id", deleteBookLive);

// blogs route
router.post("/blogs", createBlog);
router.get("/blogs", getAllBlogs);
router.get("/blogs/:id", getBlogById);
router.put("/blogs/:id", updateBlog);
router.delete("/blogs/:id", deleteBlog);

//notifications route
router.post("/send-notification", sendNotificationToUsers)
router.post("/send-notification-to-specific-users", sendNotificationToUser)

export { router };
