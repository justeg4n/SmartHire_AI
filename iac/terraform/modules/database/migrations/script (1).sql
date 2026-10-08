CREATE TABLE Users (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CognitoSub VARCHAR(100) UNIQUE, -- mapping với Cognito "sub"
    Email VARCHAR(255) NOT NULL,
    Role VARCHAR(20) DEFAULT 'Candidate'
        CHECK (Role IN ('Guest', 'Recruiter', 'Candidate', 'Admin')),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Companies (
    Id UUID PRIMARY KEY,
    Name TEXT,
    CreatedAt TIMESTAMP
);

-- RecruiterProfiles
CREATE TABLE RecruiterProfiles (
    Id UUID PRIMARY KEY,
    UserId UUID,
    CompanyId UUID,
    FOREIGN KEY (UserId) REFERENCES Users(Id),
    FOREIGN KEY (CompanyId) REFERENCES Companies(Id)
);

-- CandidateProfiles
CREATE TABLE CandidateProfiles (
    Id UUID PRIMARY KEY,
    UserId UUID,
    Seniority TEXT,
    FOREIGN KEY (UserId) REFERENCES Users(Id)
);

-- Jobs
CREATE TABLE Jobs (
    Id UUID PRIMARY KEY,
    RecruiterId UUID,
    Title TEXT,
    Description TEXT,
    CreatedAt TIMESTAMP,
    FOREIGN KEY (RecruiterId) REFERENCES RecruiterProfiles(Id)
);

-- InterviewSessions
CREATE TABLE InterviewSessions (
    Id UUID PRIMARY KEY,
    JobId UUID,
    CandidateId UUID,
    Status TEXT,
    StartedAt TIMESTAMP,
    EndedAt TIMESTAMP,
    FOREIGN KEY (JobId) REFERENCES Jobs(Id),
    FOREIGN KEY (CandidateId) REFERENCES CandidateProfiles(Id)
);

-- InterviewQuestions
CREATE TABLE InterviewQuestions (
    Id UUID PRIMARY KEY,
    SessionId UUID,
    QuestionText TEXT,
    CreatedAt TIMESTAMP,
    FOREIGN KEY (SessionId) REFERENCES InterviewSessions(Id)
);

-- InterviewAnswers
CREATE TABLE InterviewAnswers (
    Id UUID PRIMARY KEY,
    QuestionId UUID,
    Transcript TEXT,
    AudioUrl TEXT,
    FOREIGN KEY (QuestionId) REFERENCES InterviewQuestions(Id)
);

-- CodeSubmissions
CREATE TABLE CodeSubmissions (
    Id UUID PRIMARY KEY,
    SessionId UUID,
    Language TEXT,
    SourceCode TEXT,
    SubmittedAt TIMESTAMP,
    FOREIGN KEY (SessionId) REFERENCES InterviewSessions(Id)
);

-- CodeEvaluations
CREATE TABLE CodeEvaluations (
    Id UUID PRIMARY KEY,
    SubmissionId UUID,
    Passed BOOLEAN,
    RuntimeMs INTEGER,
    MemoryKb INTEGER,
    FOREIGN KEY (SubmissionId) REFERENCES CodeSubmissions(Id)
);

-- EmotionFrames
CREATE TABLE EmotionFrames (
    Id UUID PRIMARY KEY,
    SessionId UUID,
    Emotion TEXT,
    Confidence DOUBLE PRECISION,
    CapturedAt TIMESTAMP,
    FOREIGN KEY (SessionId) REFERENCES InterviewSessions(Id)
);

-- Scorecards
CREATE TABLE Scorecards (
    Id UUID PRIMARY KEY,
    SessionId UUID,
    TechnicalScore DOUBLE PRECISION,
    CommunicationScore DOUBLE PRECISION,
    ProblemSolvingScore DOUBLE PRECISION,
    OverallScore DOUBLE PRECISION,
    FOREIGN KEY (SessionId) REFERENCES InterviewSessions(Id)
);

-- InterviewReports
CREATE TABLE InterviewReports (
    Id UUID PRIMARY KEY,
    SessionId UUID,
    ReportJson TEXT,
    ReportHtml TEXT,
    FOREIGN KEY (SessionId) REFERENCES InterviewSessions(Id)
);

-- Notifications
CREATE TABLE Notifications (
    Id UUID PRIMARY KEY,
    UserId UUID,
    Type TEXT,
    Message TEXT,
    CreatedAt TIMESTAMP,
    FOREIGN KEY (UserId) REFERENCES Users(Id)
);

