from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    full_name: str
    username: str
    password: str
    role: str = "user"
    department: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    full_name: str
    username: str
    role: str
    department: Optional[str]

    class Config:
        from_attributes = True


class LoginResponse(UserResponse):
    access_token: str
    token_type: str = "bearer"


class TicketCreate(BaseModel):
    full_name: str
    department: str
    issue_type: str
    description: str
    created_by: str


class TicketUpdate(BaseModel):
    status: Optional[str] = None
    assigned_department: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None


class TicketResponse(BaseModel):
    id: int
    ticket_no: str
    full_name: str
    department: str
    issue_type: str
    description: str
    status: str
    priority: str
    assigned_department: Optional[str]
    assigned_to: Optional[str]
    created_by: str
    created_at: datetime
    updated_at: datetime
    sla_hours: int

    class Config:
        from_attributes = True


class RequestCreate(BaseModel):
    full_name: str
    department: str
    request_type: str
    description: str
    created_by: str


class RequestUpdateStatus(BaseModel):
    approval_status: str
    assigned_department: Optional[str] = None
    assigned_to: Optional[str] = None


class RequestResponse(BaseModel):
    id: int
    request_no: str
    full_name: str
    department: str
    request_type: str
    description: str
    approval_status: str
    assigned_department: Optional[str]
    assigned_to: Optional[str]
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    sender_name: str
    sender_role: str
    body: str


class MessageResponse(BaseModel):
    id: int
    item_type: str
    item_id: int
    sender_name: str
    sender_role: str
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class TimelineEventResponse(BaseModel):
    id: int
    item_type: str
    item_id: int
    event_type: str
    description: str
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class StaffPerformanceResponse(BaseModel):
    staff: str
    department: Optional[str]
    assigned_tickets: int
    solved_tickets: int
    active_tickets: int
    assigned_requests: int
    completed_requests: int
    active_requests: int
    total_work_items: int
    completion_rate: float
    avg_ticket_resolution_hours: Optional[float] = None


class AIAgentReportResponse(BaseModel):
    id: int
    item_type: str
    item_id: int
    item_no: str
    selected_issue_type: Optional[str]
    original_department: Optional[str]
    suggested_department: str
    action: str
    reason: str
    confidence: int
    data_scope: str
    created_at: datetime

    class Config:
        from_attributes = True


class KnowledgeArticleCreate(BaseModel):
    title: str
    category: str
    keywords: str
    content: str
    solution_steps: Optional[str] = None
    is_active: int = 1


class KnowledgeArticleUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    keywords: Optional[str] = None
    content: Optional[str] = None
    solution_steps: Optional[str] = None
    is_active: Optional[int] = None


class KnowledgeArticleResponse(BaseModel):
    id: int
    title: str
    category: str
    keywords: str
    content: str
    solution_steps: Optional[str]
    is_active: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class KBAskRequest(BaseModel):
    question: str


class KBAskResponse(BaseModel):
    answer: str
    resolved: bool
    confidence: int
    matched_articles: list[KnowledgeArticleResponse]
    data_scope: str


class AuditLogResponse(BaseModel):
    id: int
    actor_username: str
    actor_name: str
    actor_role: str
    action: str
    item_type: Optional[str]
    item_id: Optional[int]
    item_no: Optional[str]
    details: str
    created_at: datetime

    class Config:
        from_attributes = True
